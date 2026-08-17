import { ThinkingBlockView as ThemeThinkingBlockView } from "@astravia/theme-ui/chat";
import { useTranslation } from "react-i18next";

interface ThinkingBlockProps {
	text: string;
	exportMode?: boolean;
}

export function ThinkingBlockView({ text, exportMode = false }: ThinkingBlockProps): JSX.Element {
	const { t } = useTranslation("chat");
	return (
		<ThemeThinkingBlockView
			text={text}
			exportMode={exportMode}
			labels={{
				title: t("thinkingBlock.title"),
				lineCount: (count) => t("thinkingBlock.lineCount", { count }),
			}}
		/>
	);
}
