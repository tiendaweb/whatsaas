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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

type RuntimeLandingPageRendererProps = {
  compiledCode: string | null;
  sourceCode: string;
};

function getRuntimeComponent(compiledCode: string) {
  const module = { exports: {} as { default?: React.ComponentType } };
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
    throw new Error("El código no exporta un componente React válido.");
  }

  return component as React.ComponentType;
}

export function RuntimeLandingPageRenderer({
  compiledCode,
  sourceCode,
}: RuntimeLandingPageRendererProps) {
  const runtime = useMemo(() => {
    if (!compiledCode) {
      return {
        component: null,
        error: "No hay código compilado para renderizar.",
      };
    }

    try {
      return { component: getRuntimeComponent(compiledCode), error: null };
    } catch (error) {
      return {
        component: null,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo interpretar el código React.",
      };
    }
  }, [compiledCode]);

  if (runtime.error || !runtime.component) {
    return (
      <Alert variant="destructive" className="rounded-3xl">
        <AlertTitle>No se pudo renderizar la página custom</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{runtime.error ?? "Error desconocido al montar el componente."}</p>
          <pre className="overflow-x-auto rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-xs leading-6">
            {sourceCode}
          </pre>
        </AlertDescription>
      </Alert>
    );
  }

  const Component = runtime.component;
  return <Component />;
}
