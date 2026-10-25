import { useState } from "react";
import { Menu, MenuTrigger, MenuPopover, MenuList, MenuItem, MenuDivider } from "@fluentui/react-components";
import { SignOutRegular } from "@fluentui/react-icons";
import { useAuth } from "./AuthGate";
import { signOut } from "./authClient";
import "./auth.css";

export default function ProfileMenu() {
  const user = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const initials = user.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
  async function logout() {
    setBusy(true);
    setError("");
    try { await signOut(); }
    catch { setError("Could not sign out. Please try again."); setBusy(false); }
  }
  return (
    <>
    <Menu positioning="below-end">
      <MenuTrigger disableButtonEnhancement>
        <button type="button" className="eg-profile-trigger" aria-label={`Open profile menu for ${user.name}`} title="Your profile">
          {initials}
        </button>
      </MenuTrigger>
      <MenuPopover>
        <div className="eg-profile-details">
          <strong>{user.name}</strong>
          {user.username && <span>{user.username}</span>}
          <span>{user.roles.join(" · ")}</span>
        </div>
        <MenuDivider />
        <MenuList>
          <MenuItem icon={<SignOutRegular />} disabled={busy} onClick={() => void logout()}>
            {busy ? "Signing out…" : "Sign out"}
          </MenuItem>
        </MenuList>
      </MenuPopover>
    </Menu>
    {error && <span className="eg-profile-error" role="alert">{error}</span>}
    </>
  );
}
