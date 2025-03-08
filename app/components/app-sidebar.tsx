import {
  Bug,
  Calendar,
  CalendarPlus,
  CalendarSync,
  Code,
  House,
  LogOut,
  UserPen,
  X,
} from "lucide-react";
import { NavLink } from "react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "~/components/ui/sidebar";
import { Button } from "./ui/button";

export function AppSidebar({
  deskId,
  userId,
}: {
  deskId?: number;
  userId?: string;
}) {
  let { setOpenMobile } = useSidebar();

  return (
    <Sidebar>
      <SidebarHeader>
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 md:hidden"
          onClick={() => setOpenMobile(false)}
          aria-label="Close sidebar"
        >
          <X />
        </Button>

        <div className="flex flex-col gap-1 p-2">
          <h1 className="text-lg font-semibold">Share a desk</h1>
          <p className="text-xs text-muted-foreground">
            A workspace management app
          </p>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Desks</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <NavLink to="/" prefetch="none" tabIndex={-1}>
                  {({ isActive }) => (
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setOpenMobile(false)}
                    >
                      <House />
                      Homepage
                    </SidebarMenuButton>
                  )}
                </NavLink>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Reservations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <NavLink to="/reservations" prefetch="render" tabIndex={-1}>
                  {({ isActive }) => (
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setOpenMobile(false)}
                    >
                      <Calendar />
                      My reservations
                    </SidebarMenuButton>
                  )}
                </NavLink>
              </SidebarMenuItem>

              {deskId !== undefined && (
                <>
                  <SidebarMenuItem>
                    <NavLink to="/reserve" prefetch="intent">
                      {({ isActive }) => (
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setOpenMobile(false)}
                        >
                          <CalendarPlus />
                          Add reservation
                        </SidebarMenuButton>
                      )}
                    </NavLink>
                  </SidebarMenuItem>

                  <SidebarMenuItem>
                    <NavLink
                      to="/automatic-reservations"
                      prefetch="intent"
                      tabIndex={-1}
                    >
                      {({ isActive }) => (
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setOpenMobile(false)}
                        >
                          <CalendarSync />
                          Automatic reservations
                        </SidebarMenuButton>
                      )}
                    </NavLink>
                  </SidebarMenuItem>
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Profile</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <NavLink
                  to={`/users/edit/${userId}`}
                  className="flex w-full"
                  prefetch="intent"
                  tabIndex={-1}
                >
                  {({ isActive }) => (
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setOpenMobile(false)}
                    >
                      <UserPen />
                      Edit profile
                    </SidebarMenuButton>
                  )}
                </NavLink>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>External links</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={false}
                  onClick={() => setOpenMobile(false)}
                >
                  <a
                    href="https://github.com/VaggelisKa/my-desk"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="w-full"
                  >
                    <Code />
                    View source code
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={false}
                  onClick={() => setOpenMobile(false)}
                >
                  <a
                    href="https://github.com/VaggelisKa/my-desk/issues/new"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="w-full"
                  >
                    <Bug />
                    Report a bug
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={false}>
              <form method="POST" action="/login/logout" className="w-full">
                <LogOut />
                <input
                  className="flex w-full cursor-pointer appearance-none text-left"
                  type="submit"
                  value="Logout"
                />
              </form>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
