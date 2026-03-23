"use client";

import { useMemo } from "react";
import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { LandingPageSection } from "@/lib/landing/types";
import { cn } from "@/lib/utils";

function getRuntimeComponent(compiledCode: string) {
  const module = { exports: {} as { default?: React.ComponentType<{ section: LandingPageSection }> } };
  const exports = module.exports;
  const scope = {
    React,
    Link,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Badge,
    cn,
    ArrowRight,
    CheckCircle2,
    Sparkles,
    Bot,
    MessageSquare,
    BarChart3,
    Users,
    ShieldCheck,
    Workflow,
    Target,
    Zap,
  };

  const evaluator = new Function(
    "scope",
    "module",
    "exports",
    `"use strict"; const { React, Link, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Badge, cn, ArrowRight, CheckCircle2, Sparkles, Bot, MessageSquare, BarChart3, Users, ShieldCheck, Workflow, Target, Zap } = scope; ${compiledCode}; return module.exports.default || exports.default;`,
  );

  const component = evaluator(scope, module, exports);
  if (typeof component !== "function") {
    throw new Error("La UI custom no exporta un componente React válido.");
  }

  return component as React.ComponentType<{ section: LandingPageSection }>;
}

export function LandingSectionWidgetRenderer({
  section,
  compiledCode,
  sourceCode,
  fallback,
  showErrors = false,
}: {
  section: LandingPageSection;
  compiledCode?: string | null;
  sourceCode?: string | null;
  fallback: React.ReactNode;
  showErrors?: boolean;
}) {
  const runtime = useMemo(() => {
    if (!compiledCode) {
      return { component: null, error: null };
    }

    try {
      return { component: getRuntimeComponent(compiledCode), error: null };
    } catch (error) {
      return {
        component: null,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo interpretar la UI custom de la sección.",
      };
    }
  }, [compiledCode]);

  if (runtime.error && showErrors) {
    return (
      <Alert variant="destructive" className="rounded-3xl">
        <AlertTitle>No se pudo renderizar la UI de la sección</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{runtime.error}</p>
          {sourceCode ? (
            <pre className="overflow-x-auto rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-xs leading-6">
              {sourceCode}
            </pre>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

  if (!runtime.component) {
    return <>{fallback}</>;
  }

  const Component = runtime.component;
  return <Component section={section} />;
}
