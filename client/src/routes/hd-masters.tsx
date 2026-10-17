import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BranchMaster } from "@/components/masters/BranchMaster";
import { AreasPage, FloorsPage } from "@/components/helpdesk/LocationMasters";
import { CategoriesPage } from "@/routes/hd-categories";
import { LocationsPage } from "@/routes/hd-locations";
import { ProvidersPage } from "@/routes/hd-providers";

export const Route = createFileRoute("/hd-masters")({
  head: () => ({
    meta: [
      { title: "Helpdesk masters — FCM Helpdesk" },
      {
        name: "description",
        content:
          "Manage branches, buildings, floors, areas, service providers, and service categories.",
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
  const [tab, setTab] = useState("branches");
  const masterTabClassName =
    "border border-transparent text-primary/80 hover:bg-primary/10 hover:text-primary data-[state=active]:border-primary/20 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="FCM Helpdesk"
        title="Helpdesk Masters"
        subtitle="Manage Helpdesk branches, locations, and service catalog masters."
      />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value);
        }}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="branches" className={masterTabClassName}>
              Branch Master
            </TabsTrigger>
            <TabsTrigger value="buildings" className={masterTabClassName}>
              Building Master
            </TabsTrigger>
            <TabsTrigger value="floors" className={masterTabClassName}>
              Floor Master
            </TabsTrigger>
            <TabsTrigger value="areas" className={masterTabClassName}>
              Area Master
            </TabsTrigger>
            <TabsTrigger value="providers" className={masterTabClassName}>
              Service Provider Master
            </TabsTrigger>
            <TabsTrigger value="categories" className={masterTabClassName}>
              Service Categories Master
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="branches" className="mt-0">
          <BranchMaster helpdeskStyle />
        </TabsContent>
        <TabsContent value="buildings" className="mt-0">
          <LocationsPage embedded />
        </TabsContent>
        <TabsContent value="floors" className="mt-0">
          <FloorsPage />
        </TabsContent>
        <TabsContent value="areas" className="mt-0">
          <AreasPage />
        </TabsContent>
        <TabsContent value="providers" className="mt-0">
          <ProvidersPage embedded />
        </TabsContent>
        <TabsContent value="categories" className="mt-0">
          <CategoriesPage embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
