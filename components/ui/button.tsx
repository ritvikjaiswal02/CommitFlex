import * as React from 'react'
import Link from 'next/link'
import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/spinner'

export const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium',
    'transition-[color,background-color,border-color,box-shadow,transform] duration-120 ease-out',
    'focus-ring active:translate-y-px',
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(' '),
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg shadow-sm hover:bg-accent-hover',
        secondary:
          'border border-line-strong bg-surface text-fg shadow-sm hover:bg-sunken aria-expanded:bg-sunken',
        outline:
          'border border-line bg-transparent text-fg hover:border-line-strong hover:bg-sunken/60 aria-expanded:bg-sunken/60',
        ghost: 'text-fg-muted hover:bg-sunken hover:text-fg aria-expanded:bg-sunken aria-expanded:text-fg',
        danger: 'bg-danger text-danger-fg shadow-sm hover:bg-danger/90',
        link: 'text-accent underline-offset-4 hover:underline active:translate-y-0',
      },
      size: {
        sm: 'h-8 gap-1.5 px-3 text-sm',
        md: 'h-9 px-3.5 text-sm',
        lg: 'h-11 px-[18px] text-base',
        'icon-sm': 'size-8 text-sm',
        icon: 'size-9 text-sm',
        'icon-lg': 'size-11 text-base',
      },
    },
    compoundVariants: [
      { variant: 'link', className: 'h-auto px-0 py-0 shadow-none' },
    ],
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>

export interface ButtonProps
  extends Omit<ButtonPrimitive.Props, 'className'>,
    VariantProps<typeof buttonVariants> {
  className?: string
  /** Shows a spinner, sets aria-busy and disables the button. */
  loading?: boolean
}

const spinnerSize = (size: ButtonSize | null | undefined) =>
  size === 'lg' || size === 'icon-lg' ? 16 : 14

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading = false, disabled, children, type, ...props },
  ref,
) {
  const isIcon = typeof size === 'string' && size.startsWith('icon')
  return (
    <ButtonPrimitive
      ref={ref}
      type={type ?? 'button'}
      data-slot="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading && isIcon ? (
        <Spinner size={spinnerSize(size)} />
      ) : (
        <>
          {loading && <Spinner size={spinnerSize(size)} />}
          {children}
        </>
      )}
    </ButtonPrimitive>
  )
})

export interface ButtonLinkProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Link>, 'className'>,
    VariantProps<typeof buttonVariants> {
  className?: string
}

/** A next/link styled as a button. Use it for navigation, Button for actions. */
export const ButtonLink = React.forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { className, variant, size, ...props },
  ref,
) {
  return (
    <Link
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
})
