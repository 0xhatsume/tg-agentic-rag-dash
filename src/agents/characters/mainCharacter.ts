import { Character, ModelProviderName, Clients } from "../../core/types";
import { defaultCharacter } from "./defaultCharacter";

export const mainCharacter: Character = {
    ...defaultCharacter,
    name: "turingOne",
    clients: [Clients.TELEGRAM],
    modelProvider: ModelProviderName.ANTHROPIC,
};
