import RolePortalLayout from './RolePortalLayout';

function CashierLayout() {
  return (
    <RolePortalLayout
      ariaLabel="Điều hướng thu ngân"
      eyebrow="Khu vực thu ngân"
      portalClassName="cashier-portal"
      contentClassName="portal-content--cashier"
    />
  );
}

export default CashierLayout;
