import { Plugin } from "../../core/types";
import { continueAction, ignoreAction, noneAction } from "./actions";

export const bootstrapPlugin: Plugin = {
    name: "bootstrap",
    description: "Agent bootstrap with basic actions and evaluators",
    actions: [
        continueAction,
        // followRoomAction,
        // unfollowRoomAction,
        ignoreAction,
        noneAction,
        // muteRoomAction,
        // unmuteRoomAction,
    ],
    evaluators: [], //[factEvaluator, goalEvaluator],
    providers: [],//[boredomProvider, timeProvider, factsProvider],
};
