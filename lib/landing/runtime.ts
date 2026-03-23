import "server-only";

async function getEsbuildTransform() {
  const { transform } = await import("esbuild");
  return transform;
}

export async function compileLandingPageComponent(source: string) {
  if (!source.trim()) {
    return null;
  }

  const transform = await getEsbuildTransform();
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

function normalizeSectionWidgetSource(source: string) {
  const trimmed = source.trim();
  if (!trimmed) {
    return "";
  }

  const looksLikeBody =
    trimmed.includes("return ") ||
    trimmed.startsWith("const ") ||
    trimmed.startsWith("let ") ||
    trimmed.startsWith("if ") ||
    trimmed.startsWith("for ");

  const body = looksLikeBody ? trimmed : `return (${trimmed});`;

  return `export default function LandingSectionWidget(props) {
  const { section } = props;
  ${body}
}`;
}

export async function compileLandingSectionWidget(source: string) {
  const wrappedSource = normalizeSectionWidgetSource(source);
  if (!wrappedSource) {
    return null;
  }

  return compileLandingPageComponent(wrappedSource);
}
