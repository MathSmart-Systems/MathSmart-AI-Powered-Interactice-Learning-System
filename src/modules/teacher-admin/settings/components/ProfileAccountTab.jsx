"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Building2,
  Camera,
  CheckCircle2,
  GraduationCap,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Save,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
} from "lucide-react";

import { FIELD_IDS, PRESET_AVATARS } from "../utils/constants.js";
import {
  loadTeacherAvatar,
  saveTeacherAvatar,
  updateOwnPassword,
  updateOwnProfile,
} from "../services/settings-admin-service.js";

export function ProfileAccountTab({
  profile,
  onProfileUpdated,
  userEmail,
}) {
  // Photo State
  const [avatar, setAvatar] = useState(() => loadTeacherAvatar());
  const [photoSuccess, setPhotoSuccess] = useState(false);
  const [photoError, setPhotoError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const onAvatarChange = () => setAvatar(loadTeacherAvatar());
    window.addEventListener("mathsmart:teacher-avatar-change", onAvatarChange);
    return () => window.removeEventListener("mathsmart:teacher-avatar-change", onAvatarChange);
  }, []);

  // Name Edit State
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [nameError, setNameError] = useState(null);

  // Password Change State
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState(null);

  const handleSaveName = async (e) => {
    e.preventDefault();
    setNameError(null);
    setNameSuccess(false);

    const trimmed = fullName.trim();
    if (trimmed.length < 2) {
      setNameError("Display name must be at least 2 characters long.");
      return;
    }
    if (trimmed.length > 120) {
      setNameError("Display name cannot exceed 120 characters.");
      return;
    }

    setSavingName(true);
    const result = await updateOwnProfile(trimmed);
    setSavingName(false);

    if (!result.ok) {
      setNameError(result.error || "Failed to update display name.");
      return;
    }

    setNameSuccess(true);
    if (onProfileUpdated && result.data) {
      onProfileUpdated(result.data);
    }
    setTimeout(() => {
      setNameSuccess(false);
    }, 4000);
  };

  const handleSavePassword = async (e) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match. Please re-enter.");
      return;
    }

    setSavingPassword(true);
    const result = await updateOwnPassword(newPassword);
    setSavingPassword(false);

    if (!result.ok) {
      setPasswordError(result.error || "Failed to update password. Please try again.");
      return;
    }

    setPasswordSuccess(true);
    setNewPassword("");
    setConfirmPassword("");
    setTimeout(() => {
      setPasswordSuccess(false);
    }, 5000);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset value so re-selecting same file triggers event
    e.target.value = "";

    if (!file.type.startsWith("image/")) {
      setPhotoError("Please select a valid image file (PNG, JPG, WebP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("Image size exceeds 5MB limit. Please choose a smaller file.");
      return;
    }

    setPhotoError(null);
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 256;
        let { width, height } = img;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const resizedDataUrl = canvas.toDataURL("image/jpeg", 0.85);

        saveTeacherAvatar(resizedDataUrl);
        setAvatar(resizedDataUrl);
        setPhotoSuccess(true);
        setTimeout(() => setPhotoSuccess(false), 3000);
      };
      img.src = loadEvent.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    saveTeacherAvatar(null);
    setAvatar(null);
    setPhotoSuccess(true);
    setPhotoError(null);
    setTimeout(() => setPhotoSuccess(false), 3000);
  };

  const handleSelectPresetAvatar = (presetSvg) => {
    saveTeacherAvatar(presetSvg);
    setAvatar(presetSvg);
    setPhotoSuccess(true);
    setPhotoError(null);
    setTimeout(() => setPhotoSuccess(false), 3000);
  };

  const displayName = profile?.full_name || fullName || "Not available";
  const displayEmail = profile?.email || userEmail || "Not available";
  const schoolName = profile?.school_name || "Not assigned";
  const divisionName = profile?.division_name || "Not assigned";
  const employeeId = profile?.employee_id || "Not assigned";

  // Initials for avatar
  const initials =
    displayName && displayName !== "Not available"
      ? displayName
          .split(" ")
          .map((w) => w[0])
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase() || "T"
      : "T";

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. Teacher Display Profile Card */}
      <div className="bg-card p-6 sm:p-8 rounded-xl border border-border shadow-xs space-y-5 transition-colors">
        <div className="border-b border-border pb-4">
          <h2 className="font-display text-lg font-semibold text-foreground">Teacher Profile</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Customize your profile photo, display title, and account details.
          </p>
        </div>

        {/* Profile Photo Section */}
        <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-foreground block">
                Profile Photo & Avatar
              </span>
              <p className="text-[11px] text-muted-foreground">
                Upload a custom photo or choose a DepEd-aligned educator avatar.
              </p>
            </div>
            {avatar && (
              <button
                id={FIELD_IDS.AVATAR_REMOVE_BUTTON}
                type="button"
                onClick={handleRemovePhoto}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive hover:underline cursor-pointer"
              >
                <Trash2 className="size-3" aria-hidden="true" />
                <span>Remove Photo</span>
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {/* Avatar Preview */}
            <div className="relative size-16 rounded-full border-2 border-primary/30 overflow-hidden bg-primary/10 flex items-center justify-center shrink-0 shadow-xs">
              {avatar ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={avatar}
                  alt={displayName}
                  className="size-full object-cover"
                />
              ) : (
                <span className="font-display text-xl font-bold text-primary">
                  {initials}
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2.5 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  id={FIELD_IDS.AVATAR_UPLOAD_INPUT}
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  onChange={handleFileChange}
                  className="sr-only"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium transition-colors shadow-xs cursor-pointer"
                >
                  <Camera className="size-3.5" aria-hidden="true" />
                  <span>Upload Photo</span>
                </button>
              </div>

              {/* Preset Avatars */}
              <div className="flex items-center gap-2 pt-0.5">
                <span className="text-[11px] text-muted-foreground">Or pick an avatar:</span>
                <div className="flex items-center gap-1.5">
                  {PRESET_AVATARS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.title}
                      onClick={() => handleSelectPresetAvatar(preset.svg)}
                      className={`size-7 rounded-full border overflow-hidden p-0.5 transition-all cursor-pointer ${
                        avatar === preset.svg
                          ? "border-primary ring-2 ring-primary/40 scale-110"
                          : "border-border hover:border-foreground"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preset.svg} alt={preset.title} className="size-full rounded-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {photoSuccess && (
            <div
              role="status"
              className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium flex items-center gap-2 animate-in fade-in duration-150"
            >
              <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
              <span>Profile photo updated successfully!</span>
            </div>
          )}

          {photoError && (
            <div
              role="alert"
              className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium flex items-center gap-2 animate-in fade-in duration-150"
            >
              <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{photoError}</span>
            </div>
          )}
        </div>

        {nameSuccess && (
          <div
            role="status"
            className="p-3.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium flex items-center gap-2"
          >
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            <span>Profile name updated successfully!</span>
          </div>
        )}

        {nameError && (
          <div
            role="alert"
            className="p-3.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium flex items-center gap-2"
          >
            <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
            <span>{nameError}</span>
          </div>
        )}

        <form onSubmit={handleSaveName} className="space-y-4">
          <div className="max-w-md space-y-1.5">
            <label
              htmlFor={FIELD_IDS.PROFILE_NAME_INPUT}
              className="text-xs font-semibold text-foreground block"
            >
              Full Name / Display Title
            </label>
            <div className="relative">
              <input
                id={FIELD_IDS.PROFILE_NAME_INPUT}
                type="text"
                value={fullName}
                disabled={savingName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Maria Santos"
                className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-card text-xs text-foreground font-medium focus:ring-1 focus:ring-ring focus:border-ring outline-hidden transition-colors disabled:opacity-50"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This name will appear on student reports, activity authoring, and intervention logs.
            </p>
          </div>

          <button
            id={FIELD_IDS.PROFILE_SAVE_BUTTON}
            type="submit"
            disabled={savingName || !fullName.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-medium transition-colors shadow-xs cursor-pointer disabled:cursor-not-allowed"
          >
            {savingName ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                <span>Saving Name...</span>
              </>
            ) : (
              <>
                <Save className="size-3.5" aria-hidden="true" />
                <span>Save Profile Name</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* 2. Official DepEd Institutional Assignment (Read-Only) */}
      <div className="bg-card p-6 sm:p-8 rounded-xl border border-border shadow-xs space-y-4 transition-colors">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="size-5 text-primary" aria-hidden="true" />
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">
                DepEd Institutional Assignment
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Official school, division, and program credentials.
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary">
            ● Verified Educator
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          <div className="p-3.5 rounded-lg bg-muted/30 border border-border space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Mail className="size-3" aria-hidden="true" /> Official Email
            </span>
            <p className="text-xs font-semibold text-foreground break-all">{displayEmail}</p>
          </div>

          <div className="p-3.5 rounded-lg bg-muted/30 border border-border space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <User className="size-3" aria-hidden="true" /> Platform Role
            </span>
            <p className="text-xs font-semibold text-primary">Teacher / Administrator</p>
          </div>

          <div className="p-3.5 rounded-lg bg-muted/30 border border-border space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="size-3" aria-hidden="true" /> Assigned School
            </span>
            <p className="text-xs font-semibold text-foreground">{schoolName}</p>
          </div>

          <div className="p-3.5 rounded-lg bg-muted/30 border border-border space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <GraduationCap className="size-3" aria-hidden="true" /> School Division
            </span>
            <p className="text-xs font-semibold text-foreground">{divisionName}</p>
          </div>

          <div className="p-3.5 rounded-lg bg-muted/30 border border-border space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Employee ID
            </span>
            <p className="text-xs font-mono-math font-semibold text-foreground">{employeeId}</p>
          </div>

          <div className="p-3.5 rounded-lg bg-muted/30 border border-border space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Curriculum Scope
            </span>
            <p className="text-xs font-semibold text-foreground">Grade 6 Mathematics (DepEd ARAL)</p>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground flex items-start gap-2">
          <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Institutional school assignments and official emails are managed through your DepEd School Directory to protect student privacy and account integrity.
          </span>
        </div>
      </div>

      {/* 3. Account Password & Security */}
      <div className="bg-card p-6 sm:p-8 rounded-xl border border-border shadow-xs space-y-5 transition-colors">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <KeyRound className="size-5 text-primary" aria-hidden="true" />
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">Security & Password</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Update your account password for sign-in security.
            </p>
          </div>
        </div>

        {passwordSuccess && (
          <div
            role="status"
            className="p-3.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium flex items-center gap-2 animate-in fade-in duration-200"
          >
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            <span>Password updated successfully! You can use your new password next time you sign in.</span>
          </div>
        )}

        {passwordError && (
          <div
            role="alert"
            className="p-3.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium flex items-center gap-2"
          >
            <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
            <span>{passwordError}</span>
          </div>
        )}

        <form onSubmit={handleSavePassword} className="space-y-4 max-w-md">
          <div className="space-y-1.5">
            <label
              htmlFor={FIELD_IDS.PASSWORD_NEW_INPUT}
              className="text-xs font-semibold text-foreground block"
            >
              New Password
            </label>
            <div className="relative">
              <input
                id={FIELD_IDS.PASSWORD_NEW_INPUT}
                type="password"
                value={newPassword}
                disabled={savingPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-card text-xs text-foreground font-medium focus:ring-1 focus:ring-ring focus:border-ring outline-hidden transition-colors disabled:opacity-50"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={FIELD_IDS.PASSWORD_CONFIRM_INPUT}
              className="text-xs font-semibold text-foreground block"
            >
              Confirm New Password
            </label>
            <div className="relative">
              <input
                id={FIELD_IDS.PASSWORD_CONFIRM_INPUT}
                type="password"
                value={confirmPassword}
                disabled={savingPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-type new password"
                className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-card text-xs text-foreground font-medium focus:ring-1 focus:ring-ring focus:border-ring outline-hidden transition-colors disabled:opacity-50"
              />
            </div>
          </div>

          <button
            id={FIELD_IDS.PASSWORD_SUBMIT_BUTTON}
            type="submit"
            disabled={savingPassword || !newPassword || !confirmPassword}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-medium transition-colors shadow-xs cursor-pointer disabled:cursor-not-allowed"
          >
            {savingPassword ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                <span>Updating Password...</span>
              </>
            ) : (
              <>
                <Lock className="size-3.5" aria-hidden="true" />
                <span>Update Password</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
