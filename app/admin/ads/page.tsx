'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Megaphone, LayoutTemplate, BarChart3 } from 'lucide-react'
import { CampaignsTab } from './components/campaigns-tab'
import { CreativesTab } from './components/creatives-tab'
import { PerformanceTab } from './components/performance-tab'

export default function AdminAdsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ads Manager</h1>
        <p className="text-muted-foreground">Manage your campaigns, creatives, and view performance.</p>
      </div>

      <Tabs defaultValue="campaigns" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="campaigns" className="flex items-center gap-2">
            <Megaphone className="w-4 h-4" /> Campaigns
          </TabsTrigger>
          <TabsTrigger value="creatives" className="flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4" /> Creatives
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Performance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns">
          <CampaignsTab />
        </TabsContent>
        
        <TabsContent value="creatives">
          <CreativesTab />
        </TabsContent>
        
        <TabsContent value="performance">
          <PerformanceTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
