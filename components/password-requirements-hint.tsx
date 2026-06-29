import {
  getPasswordRequirementChecks,
  PASSWORD_REQUIREMENTS_HEADING,
} from '@/lib/validators/password'
import { cn } from '@/lib/utils'

type PasswordRequirementsHintProps = {
  className?: string
  password?: string
  /** When true, unsatisfied rules are shown in red even if the field is empty. */
  showErrors?: boolean
}

export function PasswordRequirementsHint({
  className,
  password = '',
  showErrors = false,
}: PasswordRequirementsHintProps) {
  const checks = getPasswordRequirementChecks(password)
  const highlight = showErrors || password.length > 0

  return (
    <div className={className}>
      <p className="text-xs font-medium text-neutral-600">{PASSWORD_REQUIREMENTS_HEADING}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
        {checks.map((check) => (
          <li
            key={check.key}
            className={cn(
              highlight && !check.satisfied ? 'text-red-600 font-medium' : 'text-neutral-500',
            )}
          >
            {check.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
