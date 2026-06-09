import { forwardRef, useState, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { cn } from '../../lib/utils';

type PasswordInputProps = Omit<JSX.IntrinsicElements['input'], 'type'> & {
  leftIcon?: ReactNode;
  inputClassName?: string;
};

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, inputClassName, leftIcon, ...props }, ref) => {
    const [isVisible, setIsVisible] = useState(false);

    return (
      <div className={cn('relative', className)}>
        {leftIcon ? (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {leftIcon}
          </div>
        ) : null}
        <input
          {...props}
          ref={ref}
          type={isVisible ? 'text' : 'password'}
          className={cn(
            'block w-full bg-slate-950/50 border border-white/10 rounded-lg py-2.5 pr-11 text-slate-200 placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all',
            leftIcon ? 'pl-10' : 'pl-3.5',
            inputClassName,
          )}
        />
        <button
          type="button"
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          aria-pressed={isVisible}
          onClick={() => setIsVisible((visible) => !visible)}
          className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-slate-500 transition-colors hover:text-slate-200 focus:outline-none focus-visible:text-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset rounded-r-lg"
        >
          {isVisible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
    );
  },
);

PasswordInput.displayName = 'PasswordInput';
