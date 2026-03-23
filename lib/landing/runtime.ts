import "server-only";

import ts from "typescript";

export async function compileLandingPageComponent(source: string) {
  if (!source.trim()) {
    return null;
  }

  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      jsxFactory: "React.createElement",
      jsxFragmentFactory: "React.Fragment",
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
    fileName: "landing-runtime.tsx",
  });

  const diagnostics = result.diagnostics?.filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );

  if (diagnostics?.length) {
    const message = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n",
    });
    throw new Error(`No se pudo compilar el código React.\n${message}`);
  }

  return result.outputText;
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
