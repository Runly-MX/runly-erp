import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "../lib/utils.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-(--brand-primary) text-(--brand-primary-foreground) shadow-sm hover:bg-(--brand-primary-hover) active:scale-[0.98]",
        primary:
          "bg-(--brand-primary) text-(--brand-primary-foreground) shadow-sm hover:bg-(--brand-primary-hover) active:scale-[0.98]",
        secondary:
          "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/80 active:scale-[0.98]",
        ghost:
          "hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] active:scale-[0.98]",
        destructive:
          "bg-red-500 text-white shadow-sm hover:bg-red-600 active:scale-[0.98]",
        outline:
          "border border-[hsl(var(--border))] bg-transparent hover:bg-[hsl(var(--muted))] active:scale-[0.98]",
        glass:
          "glass text-[hsl(var(--foreground))] hover:brightness-110 active:scale-[0.98]",
        "glass-prominent":
          "glass-tinted text-(--brand-primary) font-semibold hover:brightness-110 active:scale-[0.98]",
        gradient:
          "text-white shadow-[0_14px_30px_-8px_rgba(253,96,22,.5)] hover:shadow-[0_18px_38px_-8px_rgba(253,96,22,.58)] hover:-translate-y-px active:translate-y-0 active:scale-[0.98]",
        link: "text-(--brand-primary) underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "h-10 sm:h-9 px-4 py-2",
        sm: "h-7 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-6 text-base",
        icon: "h-11 w-11 sm:h-9 sm:w-9",
        "icon-sm": "h-7 w-7 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const Button = forwardRef(function Button(
  {
    className,
    variant,
    size,
    asChild = false,
    loading = false,
    disabled,
    children,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      data-variant={variant ?? "default"}
      disabled={disabled || loading}
      {...props}
    >
      {asChild ? children : (
        <>
          {loading && <Loader2 className="animate-spin" />}
          {children}
        </>
      )}
    </Comp>
  );
});

export { Button, buttonVariants };
