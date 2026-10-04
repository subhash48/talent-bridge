import { RoleNotOpen } from "@/components/careers/CareersNotices";

// notFound() from the role or its application form: the role isn't on the careers site.
export default function RoleNotFound() {
  return (
    <div className="pt-8 sm:pt-12">
      <RoleNotOpen />
    </div>
  );
}
