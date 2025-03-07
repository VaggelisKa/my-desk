import { LogOut } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "~/components/ui/sidebar";

// This is sample data.
const data = {
  versions: ["1.0.1", "1.1.0-alpha", "2.0.0-beta1"],
  navMain: [
    {
      title: "Getting Started",
      url: "#",
      items: [
        {
          title: "Installation",
          url: "#",
          isActive: false,
        },
        {
          title: "Project Structure",
          url: "#",
          isActive: true,
        },
      ],
    },
  ],
};

export function AppSidebar({ children }: { children: React.ReactNode }) {
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex flex-col gap-1 p-2">
          <h1 className="text-lg font-semibold">Share a desk</h1>
          <p className="text-xs text-muted-foreground">
            A workspace management app
          </p>
        </div>
      </SidebarHeader>
      <SidebarContent>{children}</SidebarContent>
      <SidebarRail />
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
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
