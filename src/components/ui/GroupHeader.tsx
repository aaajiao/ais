interface GroupHeaderProps {
  label: string;
  count: number;
}

export default function GroupHeader({ label, count }: GroupHeaderProps) {
  return (
    <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider sticky top-0 bg-background py-2 z-10">
      {label}
      <span className="ml-2 text-xs">({count})</span>
    </h2>
  );
}
