import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  icon?: ReactNode;
  wrapperClassName?: string;
};

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, icon, wrapperClassName, ...props }, ref) => {
    const [isVisible, setIsVisible] = useState(false);

    return (
      <div className={['admin-input-wrap', 'admin-password-input', wrapperClassName].filter(Boolean).join(' ')}>
        {icon}
        <input
          {...props}
          ref={ref}
          type={isVisible ? 'text' : 'password'}
          className={className}
        />
        <button
          type="button"
          className="admin-password-toggle"
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          aria-pressed={isVisible}
          onClick={() => setIsVisible((visible) => !visible)}
        >
          {isVisible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
      </div>
    );
  },
);

PasswordInput.displayName = 'PasswordInput';
