import { motion } from "motion/react";
import type { JSX } from "react";
import { sanctumPageAssets } from "./assets";
import { formatRealmTitle } from "./cultivationView";
import { getProfileSkills } from "./profileSkills";
import type { SanctumCultivationView } from "./types";
import { XianxiaCultivationNumber } from "./XianxiaCultivationNumber";

export function XianxiaProfileColumn({
	cultivation,
}: {
	readonly cultivation: SanctumCultivationView;
}): JSX.Element {
	const skills = getProfileSkills(cultivation);

	return (
		<section className="relative flex min-h-[650px] w-[430px] min-w-[430px] flex-none flex-col items-center justify-start self-start justify-self-center min-[1060px]:!sticky min-[1060px]:top-[90px] xl:w-[470px] xl:min-w-[470px]">
			<div className="absolute left-1/2 top-[70px] z-20 -translate-x-1/2 rounded-full bg-slate-800/65 px-6 py-1.5 text-[15px] font-semibold text-white shadow-[0_0_8px_rgba(255,255,255,0.35)]">
				当前境界 · Current Realm
			</div>
			<motion.img
				animate={{ opacity: 1, y: 0 }}
				alt=""
				aria-hidden="true"
				className="relative h-auto w-[500px] max-w-none flex-none object-contain drop-shadow-[0_0_16px_rgba(255,255,255,0.68)]"
				initial={{ opacity: 0, y: 10 }}
				src={sanctumPageAssets.character}
				transition={{ duration: 0.5, ease: "easeOut" }}
			/>
			<motion.div
				animate={{ opacity: 1, y: 0 }}
				className="relative -mt-[220px] aspect-[1131/1035] w-[440px] max-w-none flex-none"
				initial={{ opacity: 0, y: 18 }}
				transition={{ delay: 0.12, duration: 0.45, ease: "easeOut" }}
			>
				<img
					alt=""
					aria-hidden="true"
					className="absolute inset-0 h-full w-full object-contain"
					src={sanctumPageAssets.profilePanel}
				/>
				<div className="absolute inset-x-10 top-16 text-center">
					<XianxiaCultivationNumber
						className="absolute left-1/2 top-[-35px] z-10 -translate-x-1/2 drop-shadow-[0_1px_4px_rgba(15,23,42,0.8)]"
						digitClassName="h-[30px]"
						value={cultivation.level}
					/>
					<h2 className="mt-[28px] whitespace-nowrap text-[29px] font-semibold leading-8 text-slate-900">{cultivation.englishName}</h2>
					<p className="mt-[28px] text-[20px] font-semibold tracking-[0.24em] text-slate-700">{formatRealmTitle(cultivation.name)}</p>
					<p className="mx-auto mt-5 w-[300px] text-[13px] leading-5 text-slate-600">
						The foundation is laid, the core is steady. The path of immortality has truly begun.
					</p>
				</div>
				<div className="absolute inset-x-14 bottom-9">
					<div className="mb-2 text-center text-[13px] text-slate-600">
						修行能力 · Cultivation Skills
					</div>
					<div className="grid grid-cols-4 gap-2 overflow-hidden">
						{skills.map((skill, index) => (
							<motion.div
								animate={{ opacity: 1, y: 0 }}
								className="min-w-0 text-center"
								initial={{ opacity: 0, y: 8 }}
								key={skill.id}
								title={`${skill.label} · Lv.${skill.level} · 累计 ${Math.floor(skill.value).toLocaleString("zh-CN")} 修为`}
								transition={{ delay: 0.35 + index * 0.08, duration: 0.32, ease: "easeOut" }}
							>
								<img
									alt=""
									aria-hidden="true"
									className="mx-auto h-12 w-auto max-w-none drop-shadow-[0_0_7px_rgba(255,255,255,0.72)]"
									src={sanctumPageAssets.skills[index]}
								/>
								<span className="mt-1 block truncate text-[10px] leading-tight text-slate-600">{skill.label}</span>
								<span className="mt-0.5 block text-[12px] font-semibold leading-tight text-slate-700">Lv.{skill.level}</span>
							</motion.div>
						))}
					</div>
				</div>
			</motion.div>
		</section>
	);
}
