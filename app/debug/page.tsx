import ApiDebugComponent from "@/components/api-debug-component"

export default function DebugPage() {
  return (
    <div className="min-h-screen bg-background py-8">
      <div className="container mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">API Debug Interface</h1>
          <p className="text-muted-foreground">Diagnose API call issues that appear after deployment</p>
        </div>
        <ApiDebugComponent />
      </div>
    </div>
  )
}
