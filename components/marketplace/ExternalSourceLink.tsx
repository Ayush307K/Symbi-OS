import { ExternalLink } from "lucide-react";
import {
  Button,
  buttonClassName,
  type ButtonStyleOptions,
} from "@/components/ui/Button";
import { externalHttpUrl } from "@/lib/external-url";

interface ExternalSourceLinkProps extends ButtonStyleOptions {
  href: string | null;
  sourceName?: string | null;
  label?: string;
}

/** Honest fallback for attributed listings whose supplier has no SymbiOS inbox. */
export function ExternalSourceLink({
  href,
  sourceName,
  label = "View source listing",
  variant = "secondary",
  size = "md",
  fullWidth = false,
  className,
}: ExternalSourceLinkProps) {
  const safeHref = externalHttpUrl(href);
  if (!safeHref) {
    return (
      <Button
        variant={variant}
        size={size}
        fullWidth={fullWidth}
        className={className}
        disabled
      >
        External seller unavailable
      </Button>
    );
  }

  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={
        sourceName
          ? `${label} on ${sourceName} (opens in a new tab)`
          : `${label} (opens in a new tab)`
      }
      className={buttonClassName({ variant, size, fullWidth, className })}
    >
      <ExternalLink aria-hidden="true" className="h-4 w-4" />
      {label}
    </a>
  );
}

export default ExternalSourceLink;
