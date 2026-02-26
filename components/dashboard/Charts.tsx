"use client";

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface CallTypeData {
  name: string;
  value: number;
  color: string;
}

interface DailyActivityData {
  date: string;
  calls: number;
  appointments: number;
}

interface ChartsProps {
  callTypeData: CallTypeData[];
  dailyActivityData: DailyActivityData[];
}

export function Charts({ callTypeData, dailyActivityData }: ChartsProps) {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* Pie Chart - Call Type Distribution */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Call Distribution</h3>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={callTypeData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {callTypeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--tooltip-bg, white)",
                  border: "1px solid var(--tooltip-border, #e5e7eb)",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  fontSize: "12px",
                }}
                formatter={(value: number) => [`${value} calls`, "Count"]}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value) => (
                  <span className="text-xs text-gray-600 dark:text-gray-400">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bar Chart - Daily Activity */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Weekly Activity</h3>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyActivityData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #f0f0f0)" vertical={false} />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 11, fill: "var(--axis-color, #6b7280)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: "var(--axis-color, #6b7280)" }}
                tickLine={false}
                axisLine={false}
                width={30}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--tooltip-bg, white)",
                  border: "1px solid var(--tooltip-border, #e5e7eb)",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  fontSize: "12px",
                }}
                cursor={{ fill: "rgba(0, 85, 255, 0.05)" }}
              />
              <Legend
                verticalAlign="top"
                height={30}
                formatter={(value) => (
                  <span className="text-xs text-gray-600 dark:text-gray-400 capitalize">{value}</span>
                )}
              />
              <Bar 
                dataKey="calls" 
                fill="#0055FF" 
                radius={[3, 3, 0, 0]}
                name="Calls"
              />
              <Bar 
                dataKey="appointments" 
                fill="#10B981" 
                radius={[3, 3, 0, 0]}
                name="Appointments"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
