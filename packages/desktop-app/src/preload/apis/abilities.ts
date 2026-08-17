import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";
import { onIpcVoidEvent } from "./helper.js";

export function createAbilitiesApi(ipc: IpcRenderer): Pick<DesktopApi, "abilities"> {
	return {
		abilities: {
			getLedger: () => ipc.invoke("astravia:abilities:get-ledger"),
			recordMcpInstall: (runtimeName, version, metadata) =>
				ipc.invoke("astravia:abilities:record-mcp-install", runtimeName, version, metadata),
			listOpenMarketplace: () => ipc.invoke("astravia:abilities:list-open-marketplace"),
			refreshOpenMarketplace: () => ipc.invoke("astravia:abilities:refresh-open-marketplace"),
			listOpenMarketplaces: () => ipc.invoke("astravia:abilities:list-open-marketplaces"),
			refreshOpenMarketplaces: () => ipc.invoke("astravia:abilities:refresh-open-marketplaces"),
			listMarketplaceSources: () => ipc.invoke("astravia:abilities:list-marketplace-sources"),
			addMarketplaceSource: (input) => ipc.invoke("astravia:abilities:add-marketplace-source", input),
			updateMarketplaceSource: (id, input) => ipc.invoke("astravia:abilities:update-marketplace-source", id, input),
			removeMarketplaceSource: (id) => ipc.invoke("astravia:abilities:remove-marketplace-source", id),
			refreshMarketplaceSource: (id) => ipc.invoke("astravia:abilities:refresh-marketplace-source", id),
			onOpenMarketplacesUpdated: (handler) =>
				onIpcVoidEvent(ipc, "astravia:abilities:open-marketplaces-updated", handler),
			installOpenAbility: (type, slug, sourceId) =>
				ipc.invoke("astravia:abilities:install-open-ability", type, slug, sourceId),
		},
	};
}
