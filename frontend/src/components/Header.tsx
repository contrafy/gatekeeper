// Header.tsx (replace the previous file)
import React, { useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";
import {
  CredentialResponse,
  GoogleLogin,
  GoogleOAuthProvider,
  googleLogout,
} from "@react-oauth/google";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Shield } from "lucide-react";
import { ModeToggle } from "./mode-toggle";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;

interface HeaderProps {
  token: string;
  setToken: (t: string) => void;
}

const Header: React.FC<HeaderProps> = ({ token, setToken }) => {
  const [userName, setUserName] = useState("");
  const [userPicture, setUserPicture] = useState("");

  /* ---------- local‑storage & decode bookkeeping ---------- */
  useEffect(() => {
    // on first mount, hydrate from storage
    const savedName = localStorage.getItem("userName") ?? "";
    const savedPic  = localStorage.getItem("userPicture") ?? "";
    setUserName(savedName);
    setUserPicture(savedPic);
  }, []);

  useEffect(() => {
    if (!token) return;
    const decoded: any = jwtDecode(token);
    const pic  = decoded.picture ?? "";
    const name = decoded.name ?? "";
    setUserPicture(pic);
    setUserName(name);
    localStorage.setItem("userName", name);
    localStorage.setItem("userPicture", pic);
  }, [token]);

  const handleGoogleSuccess = (cred: CredentialResponse) => {
    if (!cred.credential) return;
    setToken(cred.credential);          // bubble up
    // the decoding runs in the effect above
    localStorage.setItem("token", cred.credential);
  };

  const handleSignOut = () => {
    googleLogout();
    setToken("");
    setUserName("");
    setUserPicture("");
    localStorage.clear();               // nuke all auth bits
  };

  /* ---------------------------- UI ------------------------ */
  return (
    <header className="fixed top-0 w-full mb-5 border-b bg-white dark:bg-black">
      <div className="flex items-center justify-between w-full px-7.5 py-2">
        {/* —————————————————— left —————————————————— */}
        <div className="flex items-center space-x-2">
          <Shield className="h-5 w-5 text-[#4285F4]" />
          <span className="font-semibold text-[#202124] dark:text-white text-base">
            Gatekeeper
          </span>
        </div>

        {/* —————————————————— right ————————————————— */}
        <div className="flex items-center space-x-4">
          <ModeToggle />

          <GoogleOAuthProvider clientId={CLIENT_ID}>
            {token ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Avatar className="cursor-pointer">
                    <AvatarImage src={userPicture} alt="Me" />
                    <AvatarFallback>Me</AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>

                <DropdownMenuContent>
                  <DropdownMenuLabel className="text-[#4285F4]">
                    Signed in as {userName}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      className="cursor-pointer hover:bg-[#DB4437]/10 text-[#DB4437]"
                      onClick={handleSignOut}
                    >
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="google-login-container dark:bg-gray-800 dark:border dark:border-gray-700 dark:rounded-full">
                <GoogleLogin
                  shape="rectangular"
                  useOneTap={false}
                  onSuccess={handleGoogleSuccess}
                  onError={() => console.error("login failed")}
                />
              </div>
            )}
          </GoogleOAuthProvider>
        </div>
      </div>
    </header>
  );
};

export default Header;