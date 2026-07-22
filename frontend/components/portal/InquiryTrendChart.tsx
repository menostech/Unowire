'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DataPoint {
  date: string;
  count: number;
}

export function InquiryTrendChart({ data }: { data: DataPoint[] }) {
  return (
    <div className="rounded-lg bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-gray-700">Inquiries (30 days)</h2>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickFormatter={(d: string) => d.slice(5)}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
            <Tooltip
              labelStyle={{ fontSize: 12 }}
              contentStyle={{ fontSize: 12, borderRadius: 4, border: '1px solid #e5e7eb' }}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              name="Inquiries"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
