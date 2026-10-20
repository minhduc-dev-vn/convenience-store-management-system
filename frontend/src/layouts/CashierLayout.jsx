import RolePortalLayout from './RolePortalLayout';

function CashierLayout() {
  return (
    <RolePortalLayout
      ariaLabel="Điều hướng thu ngân"
      portalClassName="cashier-portal"
      contentClassName="portal-content--cashier"
    />
  );
}

export default CashierLayout;
