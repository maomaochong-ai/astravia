import type { JSX } from "react";
import { xianxiaAssets } from "../assets";

export function XianxiaNewSessionBackground(): JSX.Element {
	return (
		<>
			<img
				alt=""
				aria-hidden="true"
				className="xianxia-frame-glow-silver pointer-events-none absolute right-[2%] top-[3%] z-0 w-[clamp(280px,38vw,640px)] object-contain"
				src={xianxiaAssets.whiteGlazeImmortal}
			/>
			<img
				alt=""
				aria-hidden="true"
				className="xianxia-frame-glow-gold-strong pointer-events-none absolute right-[1%] top-[15%] z-0 w-[clamp(90px,12vw,180px)] object-contain"
				src={xianxiaAssets.whiteGlazeGourd}
			/>
		</>
	);
}
