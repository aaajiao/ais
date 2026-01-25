import { Loader2 } from 'lucide-react';

export default function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}
