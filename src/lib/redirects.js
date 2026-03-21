export function getDashboardForRole(role) {
  switch (role) {
    case "super_admin":
      return "/admin/god-mode";
    case "service_provider_admin":
    case "service_provider_evaluator":
      return "/service-provider/dashboard";
    case "association_admin":
      return "/association/dashboard";
    case "director":
      return "/director/dashboard";
    case "association_evaluator":
    case "volunteer":
      return "/evaluator/dashboard";
    default:
      return "/evaluator/dashboard";
  }
}
