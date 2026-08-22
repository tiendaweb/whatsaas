import { Braces, Database, FolderKanban, Globe2, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type ConnectorAdminCapabilitiesProps = {
  title: string;
  description: string;
  projects: string;
  code: string;
  domains: string;
  data: string;
  guardrailTitle: string;
  guardrailDescription: string;
};

export function ConnectorAdminCapabilities({
  title,
  description,
  projects,
  code,
  domains,
  data,
  guardrailTitle,
  guardrailDescription,
}: ConnectorAdminCapabilitiesProps) {
  const capabilities = [
    { icon: FolderKanban, label: projects },
    { icon: Braces, label: code },
    { icon: Globe2, label: domains },
    { icon: Database, label: data },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {capabilities.map(({ icon: Icon, label }) => (
            <div key={label} className="flex min-h-24 items-start gap-3 bg-card p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4.5" />
              </span>
              <p className="pt-1 text-sm font-semibold leading-5">{label}</p>
            </div>
          ))}
        </div>
        <Alert>
          <ShieldCheck />
          <AlertTitle>{guardrailTitle}</AlertTitle>
          <AlertDescription>{guardrailDescription}</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
