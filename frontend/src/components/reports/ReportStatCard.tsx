import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';

export function ReportStatCard(props: { title: string; value: number; valueClassName?: string }) {
  return (
    <Card className="bg-slate-950/40 border-white/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">{props.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${props.valueClassName || ''}`}>{props.value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}

