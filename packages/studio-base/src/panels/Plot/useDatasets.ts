// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as Comlink from "comlink";
import * as R from "ramda";
import { useEffect, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";

import { useDeepMemo } from "@foxglove/hooks";
import { Immutable } from "@foxglove/studio";
import { useMessageReducer as useCurrent, useDataSourceInfo } from "@foxglove/studio-base/PanelAPI";
import { useBlocksSubscriptions as useBlocks } from "@foxglove/studio-base/PanelAPI/useBlocksSubscriptions";
import {
  RosPath,
  MessagePathPart,
} from "@foxglove/studio-base/components/MessagePathSyntax/constants";
import parseRosPath from "@foxglove/studio-base/components/MessagePathSyntax/parseRosPath";
import {
  useMessagePipeline,
  MessagePipelineContext,
} from "@foxglove/studio-base/components/MessagePipeline";
import { mergeSubscriptions } from "@foxglove/studio-base/components/MessagePipeline/subscriptions";
import { TypedDataProvider } from "@foxglove/studio-base/components/TimeBasedChart/types";
import useGlobalVariables from "@foxglove/studio-base/hooks/useGlobalVariables";
import { SubscribePayload, MessageEvent } from "@foxglove/studio-base/players/types";

import { initBlockState, refreshBlockTopics, processBlocks, BlockState } from "./blocks";
import { PlotParams, BasePlotPath } from "./internalTypes";
import { PlotData, getMetadata } from "./plotData";
import { buildPlot } from "./processor/accumulate";

type Service = Comlink.Remote<(typeof import("./useDatasets.worker"))["service"]>;

type SubscriberState = {
  subscriptions: SubscribePayload[];
  paths: string[];
};
type Client = {
  id: string;
  params: PlotParams | undefined;
  state: BlockState;
  setter: (state: SubscriberState) => void;
};

let worker: Worker | undefined;
let service: Service | undefined;
let numClients: number = 0;
let clients: Record<string, Client> = {};

const pending: ((service: Service) => void)[] = [];
async function waitService(): Promise<Service> {
  if (service != undefined) {
    return service;
  }
  return await new Promise((resolve) => {
    pending.push(resolve);
  });
}

const getIsLive = (ctx: MessagePipelineContext) => ctx.seekPlayback == undefined;

/**
 * Get the SubscribePayload for a single path by subscribing to all fields
 * referenced in leading MessagePathFilters and the first field of the
 * message.
 */
export function pathToPayload(path: RosPath): SubscribePayload | undefined {
  const { messagePath: parts, topicName: topic } = path;

  // We want to take _all_ of the filters that start the path, since these can
  // be chained
  const filters = R.takeWhile((part: MessagePathPart) => part.type === "filter", parts);
  const firstField = R.find((part: MessagePathPart) => part.type === "name", parts);
  if (firstField == undefined || firstField.type !== "name") {
    return undefined;
  }

  return {
    topic,
    fields: R.pipe(
      R.chain((part: MessagePathPart): string[] => {
        if (part.type !== "filter") {
          return [];
        }
        const { path: filterPath } = part;
        const field = filterPath[0];
        if (field == undefined) {
          return [];
        }

        return [field];
      }),
      // Always subscribe to the header field
      (filterFields) => [...filterFields, firstField.name, "header"],
      R.uniq,
    )(filters),
  };
}

function getPayloadsFromPaths(paths: readonly string[]): SubscribePayload[] {
  return R.pipe(
    R.chain((path: string): SubscribePayload[] => {
      const parsed = parseRosPath(path);
      if (parsed == undefined) {
        return [];
      }

      const payload = pathToPayload(parsed);
      if (payload == undefined) {
        return [];
      }

      return [payload];
    }),
    // Then simplify
    (v: SubscribePayload[]) => mergeSubscriptions(v) as SubscribePayload[],
  )(paths);
}

// Calculate the list of unique topics that _all_ of the plots need and
// nominate one panel to subscribe to the topics on behalf of the rest.
function chooseClient() {
  if (R.isEmpty(clients)) {
    return;
  }

  const clientList = R.values(clients);
  const paths = R.pipe(
    R.chain((client: Client): BasePlotPath[] => {
      const { params } = client;
      if (params == undefined) {
        return [];
      }

      const { xAxisPath, paths: yAxisPaths } = params;
      return [...(xAxisPath != undefined ? [xAxisPath] : []), ...yAxisPaths];
    }),
    R.uniqBy((path) => path.value),
    R.map((path: BasePlotPath) => path.value),
  )(clientList);

  const subscriptions = R.pipe(
    getPayloadsFromPaths,
    (v) => mergeSubscriptions(v) as SubscribePayload[],
    R.map((v: SubscribePayload): SubscribePayload => ({ ...v, preloadType: "full" })),
  )(paths);

  clientList[0]?.setter({ subscriptions, paths });
}

// Subscribe to "current" messages (those near the seek head) and forward new
// messages to the worker as they arrive.
function useData(id: string, params: PlotParams) {
  const [{ subscriptions }, setState] = React.useState<SubscriberState>({
    paths: [],
    subscriptions: [],
  });
  // Register client when the panel mounts and unregister when it unmounts
  useEffect(() => {
    clients = {
      ...clients,
      [id]: {
        id,
        params: undefined,
        state: initBlockState(),
        setter: setState,
      },
    };
    chooseClient();
    return () => {
      const { [id]: _client, ...rest } = clients;
      clients = rest;
      chooseClient();
    };
  }, [id]);

  // Update registration when params change
  useEffect(() => {
    const { [id]: client } = clients;
    if (client == undefined) {
      return;
    }

    const { state } = client;

    const clientSubscriptions = R.pipe(
      (params: PlotParams): BasePlotPath[] => {
        const { xAxisPath, paths: yAxisPaths } = params;
        return [...(xAxisPath != undefined ? [xAxisPath] : []), ...yAxisPaths];
      },
      R.uniqBy((path) => path.value),
      R.map((path: BasePlotPath) => path.value),
      getPayloadsFromPaths,
    )(params);

    clients = {
      ...clients,
      [id]: { ...client, params, state: refreshBlockTopics(clientSubscriptions, state) },
    };
    chooseClient();
  }, [id, params]);

  // go from paths -> vars/meta -> (Message -> TypedData | undefined)
  // need path -> block cursor, data builder

  const { topics, datatypes } = useDataSourceInfo();
  const metadata = React.useMemo(() => getMetadata(topics, datatypes), [topics, datatypes]);
  const { globalVariables } = useGlobalVariables();

  // make worker responsible for clearing out paths that use globalVariables in
  // response to changes

  const isLive = useMessagePipeline<boolean>(getIsLive);
  useEffect(() => {
    void (async () => {
      const s = await waitService();
      await s.setLive(isLive);
    })();
  }, [isLive]);

  useCurrent<number>({
    topics: subscriptions,
    restore: React.useCallback((state: number | undefined): number => {
      if (state == undefined) {
        void service?.clearCurrent();
      }
      return 0;
    }, []),
    addMessages: React.useCallback(
      (_: number | undefined, messages: readonly MessageEvent[]): number => {
        void service?.addCurrent(messages);
        return 1;
      },
      [],
    ),
  });

  const blocks = useBlocks(subscriptions);
  useEffect(() => {
    clients = R.map((client) => {
      const { state } = client;
      const { state: newState, resetTopics, newData } = processBlocks(blocks, subscriptions, state);

      for (const bundle of newData) {
        if (!R.isEmpty(bundle)) {
          console.log(client.id, buildPlot(metadata, globalVariables, params, bundle));
        }
      }

      return {
        ...client,
        state: newState,
      };

      //void service?.addBlock(
      //R.pipe(
      //R.map((topic: string): [string, MessageEvent[]] => [topic, []]),
      //R.fromPairs,
      //)(resetTopics),
      //resetTopics,
      //);

      //for (const bundle of newData) {
      //void service?.addBlock(bundle, []);
      //}
    }, clients);
  }, [subscriptions, blocks, metadata, globalVariables]);
}

/**
 * useDatasets uses a Web Worker to collect, aggregate, and downsample plot
 * data for use by a TimeBasedChart.
 */
export default function useDatasets(params: PlotParams): {
  data: Immutable<PlotData> | undefined;
  provider: TypedDataProvider;
  getFullData: () => Promise<PlotData | undefined>;
} {
  const id = useMemo(() => uuidv4(), []);
  const stableParams = useDeepMemo(params);

  useEffect(() => {
    if (worker == undefined) {
      worker = new Worker(
        // foxglove-depcheck-used: babel-plugin-transform-import-meta
        new URL("./useDatasets.worker", import.meta.url),
      );
      service = Comlink.wrap(worker);
      for (const other of pending) {
        other(service);
      }
    }

    numClients++;

    return () => {
      numClients--;
      if (numClients === 0) {
        worker?.terminate();
        worker = service = undefined;
      }
    };
  }, []);

  const [state, setState] = React.useState<Immutable<PlotData> | undefined>();
  useEffect(() => {
    return () => {
      void service?.unregister(id);
    };
  }, [id]);

  useData(id, stableParams);

  // We also need to send along params on register to avoid a race condition
  const paramsRef = React.useRef<PlotParams>();
  useEffect(() => {
    paramsRef.current = stableParams;
    void service?.updateParams(id, stableParams);
  }, [id, stableParams]);

  const provider: TypedDataProvider = React.useMemo(
    () => ({
      setView: (view) => {
        void service?.updateView(id, view);
      },
      register: (setter, setPartial) => {
        void (async () => {
          const s = await waitService();
          void s.register(
            id,
            Comlink.proxy(setter),
            Comlink.proxy(setState),
            Comlink.proxy(setPartial),
            paramsRef.current,
          );
        })();
      },
    }),
    [id],
  );

  const getFullData = React.useMemo(
    () => async () => {
      const s = await waitService();
      return await s.getFullData(id);
    },
    [id],
  );

  return React.useMemo(
    () => ({
      data: state,
      provider,
      getFullData,
    }),
    [state, provider, getFullData],
  );
}
