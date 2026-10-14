import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoriesPage } from "@/routes/hd-categories";
import { LocationsPage } from "@/routes/hd-locations";
import { ProvidersPage } from "@/routes/hd-providers";

export const Route = createFileRoute("/hd-masters")({
  head: () => ({
    meta: [
      { title: "Helpdesk masters — FCM Helpdesk" },
      {
        name: "description",
        content: "Manage Helpdesk service providers, building locations and service categories.",
      },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN"]}>
      <HelpdeskMastersPage />
    </AppPage>
  ),
});

function HelpdeskMastersPage() {
  const [tab, setTab] = useState("providers");
  const toolbar: ReactNode = (
    <TabsList className="h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
      <TabsTrigger
        value="providers"
        className="border border-primary/20 bg-primary/10 text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
      >
        Service providers
      </TabsTrigger>
      <TabsTrigger
        value="locations"
        className="border border-primary/20 bg-primary/10 text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
      >
        Building locations
      </TabsTrigger>
      <TabsTrigger
        value="categories"
        className="border border-primary/20 bg-primary/10 text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
      >
        Service categories
      </TabsTrigger>
    </TabsList>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="FCM Helpdesk"
        title="Helpdesk masters"
        subtitle="Manage service providers, building locations, and service categories in one place."
      />
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsContent value="providers" className="mt-0">
          <ProvidersPage embedded toolbar={toolbar} />
        </TabsContent>
        <TabsContent value="locations" className="mt-0">
          <LocationsPage embedded toolbar={toolbar} />
        </TabsContent>
        <TabsContent value="categories" className="mt-0">
          <CategoriesPage embedded toolbar={toolbar} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
