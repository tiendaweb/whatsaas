import { transform } from "esbuild";

export async function compileLandingPageComponent(source: string) {
  if (!source.trim()) {
    return null;
  }

  const result = await transform(source, {
    loader: "tsx",
    format: "cjs",
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    target: "es2020",
  });

  return result.code;
}
