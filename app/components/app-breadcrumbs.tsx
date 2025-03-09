import { useMemo } from "react";
import { Link, useLocation } from "react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";

let BREADCRUMB_KEYS: Record<string, string> = {
  "/reservations": "My reservations",
  "/reserve": "Add reservation",
  "/automatic-reservations": "Automatic reservations",
  "/users/edit/": "Edit your profile",
  "/desks/": "Edit desk",
  "/metrics": "Desk & booking metrics",
};

export function AppBreadcrumbs() {
  let { pathname } = useLocation();
  let currentPageLabel = useMemo(() => {
    let key =
      Object.keys(BREADCRUMB_KEYS).find((key) => pathname.includes(key)) ?? "";

    return BREADCRUMB_KEYS[key];
  }, [pathname]);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {pathname === "/" ? (
          <BreadcrumbPage>Desks</BreadcrumbPage>
        ) : (
          <>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink asChild>
                <Link to="/" prefetch="none">
                  Desks
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{currentPageLabel}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
