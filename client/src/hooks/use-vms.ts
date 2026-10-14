import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/context/app-context";
import { db, visibleVisits } from "@/services/vms";
import { listVisits } from "@/services/visits-api";
import { isSelectableVisitorType, visitorTypeLabel } from "@/constants/visitor-types";

/** Reads masters from storage and visits from the API, re-evaluated on refresh(). */
export function useVms() {
  const { version, hydrated, user } = useApp();
  const visitsQuery = useQuery({
    queryKey: ["visits", version, user?.id],
    queryFn: listVisits,
    enabled: Boolean(hydrated && user),
    retry: 1,
  });

  return useMemo(() => {
    void version;
    const allVisits = visitsQuery.data ?? [];
    if (!hydrated) {
      return {
        ready: false as const,
        branches: [],
        employees: [],
        departments: [],
        designations: [],
        roles: [],
        users: [],
        visitorTypes: [],
        cards: [],
        allVisits: [],
        visits: [],
        notifications: [],
        logs: [],
        emails: [],
        settings: db.settings(),
      };
    }
    return {
      ready: true as const,
      branches: db.branches(),
      employees: db.employees(),
      departments: db.departments(),
      designations: db.designations(),
      roles: db.roles(),
      users: db.users(),
      visitorTypes: db
        .visitorTypes()
        .filter((visitorType) => isSelectableVisitorType(visitorType.key))
        .map((visitorType) => ({ ...visitorType, name: visitorTypeLabel(visitorType.key, visitorType.name) })),
      cards: db.cards(),
      allVisits,
      visits: visibleVisits(user, allVisits),
      notifications: db.notifications(),
      logs: db.logs(),
      emails: db.emails(),
      settings: db.settings(),
    };
  }, [version, hydrated, user, visitsQuery.data]);
}
