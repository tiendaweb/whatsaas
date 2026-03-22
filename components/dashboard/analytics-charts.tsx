'use client';

import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  BarChart, 
  Bar, 
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Filter } from 'lucide-react';

const RoundedBar = (props: any) => {
  const { x, y, width, height, fill } = props;
  const radius = 5; 

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} rx={radius} ry={radius} />
    </g>
  );
};

type TrafficData = {
  date: string;
  count: number;
  weekday: number;
};

export function TrafficHeatmap({ data }: { data: TrafficData[] }) {
  const getIntensityClass = (count: number) => {
    if (count === 0) return 'bg-muted/40'; 
    if (count < 5) return 'bg-primary/30';
    if (count < 10) return 'bg-primary/50';
    if (count < 20) return 'bg-primary/75';
    return 'bg-primary'; 
  };

  const weeks: TrafficData[][] = [];
  let currentWeek: TrafficData[] = [];
  
  data.forEach((day, index) => {
    if (index === 0) {
      for (let i = 0; i < day.weekday; i++) {
        currentWeek.push({ date: `empty-${i}`, count: -1, weekday: i });
      }
    }
    
    currentWeek.push(day);

    if (day.weekday === 6 || index === data.length - 1) {
      if (day.weekday !== 6) {
          for (let i = day.weekday + 1; i <= 6; i++) {
              currentWeek.push({ date: `empty-end-${i}`, count: -1, weekday: i });
          }
      }
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });

  return (
    <Card className="col-span-4 lg:col-span-3 h-full flex flex-col shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle>Conversation Traffic</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-center overflow-hidden pb-6">
        <div className="flex flex-col gap-6 w-full overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 min-w-max mx-auto px-4">
            <div className="flex flex-col justify-between text-xs text-muted-foreground pt-1 pb-1 pr-2 h-[260px]">
                <span>Mon</span>
                <span>Wed</span>
                <span>Fri</span>
            </div>
            
            <div className="flex gap-2">
                {weeks.map((week, wIndex) => (
                <div key={wIndex} className="flex flex-col gap-2 h-[260px]">
                    {week.map((day) => {
                        if (day.count === -1) {
                            return <div key={day.date} className="w-8 h-8 bg-transparent" />;
                        }
                        return (
                        <div
                            key={day.date}
                            className={cn(
                            "w-8 h-8 rounded-md transition-all cursor-pointer hover:scale-110 hover:shadow-md",
                            getIntensityClass(day.count)
                            )}
                            title={`${day.date}: ${day.count} messages`}
                        />
                        );
                    })}
                </div>
                ))}
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground mt-2">
            <span>Less</span>
            <div className="flex gap-1.5">
                <div className="w-4 h-4 rounded-[2px] bg-muted/40" />
                <div className="w-4 h-4 rounded-[2px] bg-primary/30" />
                <div className="w-4 h-4 rounded-[2px] bg-primary/50" />
                <div className="w-4 h-4 rounded-[2px] bg-primary/75" />
                <div className="w-4 h-4 rounded-[2px] bg-primary" />
            </div>
            <span>More</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function FunnelLineChart({ data }: { data: any[] }) {
  return (
    <Card className="col-span-4 lg:col-span-4 shadow-sm">
      <CardHeader>
        <CardTitle>Conversations by Funnel (Trend)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
              <XAxis 
                dataKey="name" 
                stroke="#E5E7EB" 
                fontSize={12} 
                tickLine={false} 
                axisLine={false} 
                dy={10}
              />
              <YAxis 
                stroke="#E5E7EB" 
                fontSize={12} 
                tickLine={false} 
                axisLine={false}
                dx={-10}
                tickFormatter={(value) => `${value}`} 
              />
              <Tooltip 
                 contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))', 
                    borderColor: 'hsl(var(--border))', 
                    borderRadius: '8px', 
                    color: '#E5E7EB',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                 }}
                 cursor={{ fill: 'transparent' }}
              />
              <Bar 
                dataKey="value" 
                fill="#49b653" 
                shape={<RoundedBar />} 
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function FunnelRadarChart({ data }: { data: any[] }) {
  const chartData = data.map(item => ({
    subject: item.name,
    A: item.value,
    fullMark: Math.max(...data.map((d: any) => d.value)) * 1.2
  }));

  return (
    <Card className="col-span-4 lg:col-span-2 h-full shadow-sm">
      <CardHeader>
        <CardTitle>Funnel Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full flex justify-center items-center">
            {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="90%" data={chartData}>
                    <PolarGrid className="stroke-muted" />
                    <PolarAngleAxis 
                        dataKey="subject" 
                        tick={{ fill: '#E5E7EB', fontSize: 11, fontWeight: 500 }} 
                    />
                    <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={false} axisLine={false} />
                    <Radar
                        name="Conversations"
                        dataKey="A"
                        stroke="#49b653"
                        strokeWidth={2}
                        fill="#49b653"
                        fillOpacity={0.4}
                    />
                    <Tooltip 
                        contentStyle={{ 
                            backgroundColor: 'hsl(var(--popover))', 
                            borderColor: 'hsl(var(--border))', 
                            borderRadius: '8px', 
                            color: '#E5E7EB' 
                        }}
                    />
                    </RadarChart>
                </ResponsiveContainer>
            ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    No data available
                </div>
            )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AgentList({ data }: { data: any[] }) {
  return (
    <Card className="col-span-4 lg:col-span-3 shadow-sm">
      <CardHeader>
        <CardTitle>Conversations by Agent</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-[300px] overflow-auto pr-2">
            <Table>
            <TableHeader>
                <TableRow className="hover:bg-transparent">
                <TableHead className="w-[180px]">Agent</TableHead>
                <TableHead>Funnel Breakdown</TableHead>
                <TableHead className="text-right w-[80px]">Total</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.map((agent) => (
                <TableRow key={agent.name} className="group">
                    <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0 ring-2 ring-transparent group-hover:ring-primary/20 transition-all">
                                {agent.name.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="truncate font-semibold text-foreground/80">{agent.name}</span>
                        </div>
                    </TableCell>
                    <TableCell>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(agent.funnels).map(([funnelName, count]) => (
                        <div key={funnelName} className="flex items-center gap-1.5 bg-secondary/50 px-2 py-1 rounded-md text-[11px] border border-border/50">
                            <Filter className="w-3 h-3 text-muted-foreground" />
                            <span className="font-medium text-muted-foreground">{funnelName}</span>
                            <span className="font-bold text-foreground ml-0.5">
                                {String(count)}
                            </span>
                        </div>
                        ))}
                    </div>
                    </TableCell>
                    <TableCell className="text-right font-bold text-lg">{agent.total}</TableCell>
                </TableRow>
                ))}
                {data.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground h-32">
                            No agents found
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
            </Table>
        </div>
      </CardContent>
    </Card>
  );
}