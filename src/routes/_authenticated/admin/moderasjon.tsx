// kaupet_open-erstatning for moderasjonssiden: varsler, annonser og
// utestengte. Forvaltning av IP-sperrer, svartelisting, logger og kjøretøymerker er
// ikke med.
import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListingsTab } from "@/components/admin/moderasjon/listings-tab";
import { BansTab } from "@/components/admin/moderasjon/bans-tab";
import { ReportsTab } from "@/components/admin/moderasjon/reports-tab";
import { useIsAdmin } from "@/hooks/use-user-roles";

export const Route = createFileRoute("/_authenticated/admin/moderasjon")({
  head: () => ({ meta: [{ title: "Moderasjon — kaupet_open" }] }),
  component: ModerationPage,
});

function ModerationPage() {
  const { data: isAdmin } = useIsAdmin();

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl tracking-tight">Moderasjon</h2>
      <Tabs defaultValue="reports" className="space-y-6">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="reports">Varsler</TabsTrigger>
          {isAdmin && (
            <>
              <TabsTrigger value="listings">Annonser</TabsTrigger>
              <TabsTrigger value="bans">Utestengte</TabsTrigger>
            </>
          )}
        </TabsList>
        <TabsContent value="reports">
          <ReportsTab />
        </TabsContent>
        {isAdmin && (
          <>
            <TabsContent value="listings">
              <ListingsTab />
            </TabsContent>
            <TabsContent value="bans">
              <BansTab />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
