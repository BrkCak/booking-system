import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
	{
		ignores: ["eslint.config.mjs"],
		settings: {
			react: {
				version: "19.2",
			},
		},
	},
	...nextCoreWebVitals,
	...nextTypeScript,
];

export default eslintConfig;
