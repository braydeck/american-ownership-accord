import React from 'react';

const tooltipStyle = {
  backgroundColor: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 12,
  color: '#fafafa',
  fontFamily: 'Geist, system-ui, sans-serif',
};

export function ChartTooltip({ active, payload, label, formatter, labelFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={tooltipStyle}>
      <p style={{ fontWeight: 600, marginBottom: 4 }}>
        {labelFormatter ? labelFormatter(label) : label}
      </p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color || '#fafafa', margin: '2px 0' }}>
          {entry.name}: {formatter ? formatter(entry.value, entry.name) : entry.value}
        </p>
      ))}
    </div>
  );
}
