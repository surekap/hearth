"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ChevronDown, Dna, Download, Images, Pill, UserRound, Users } from "lucide-react";
import { switchProfile } from "@/app/actions/profiles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Profile = {
  id: string;
  displayName: string;
  relationship: string;
};

export function ProfileSwitcher({
  profiles,
  activeProfileId,
  hasGenetics = false,
}: {
  profiles: Profile[];
  activeProfileId: string | null;
  /** Genetics only earns a menu entry once a report exists for this person. */
  hasGenetics?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const active = profiles.find((p) => p.id === activeProfileId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("max-w-[42vw] gap-1.5 font-medium", pending && "opacity-60")}
        >
          <UserRound className="size-4" />
          <span className="truncate">{active?.displayName ?? "No profile"}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Family profiles</DropdownMenuLabel>
        {profiles.map((p) => (
          <DropdownMenuItem
            key={p.id}
            className={cn(p.id === activeProfileId && "bg-accent font-medium")}
            onClick={() => startTransition(() => switchProfile(p.id))}
          >
            {p.displayName}
            <span className="ml-auto text-xs capitalize text-muted-foreground">
              {p.relationship}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{active?.displayName ?? "Profile"}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/meds">
            <Pill className="size-4" />
            Medications
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/images">
            <Images className="size-4" />
            Scans
          </Link>
        </DropdownMenuItem>
        {hasGenetics && (
          <DropdownMenuItem asChild>
            <Link href="/genetics">
              <Dna className="size-4" />
              Genetics
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/export">
            <Download className="size-4" />
            Export &amp; API
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profiles">
            <Users className="size-4" />
            Manage profiles
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
