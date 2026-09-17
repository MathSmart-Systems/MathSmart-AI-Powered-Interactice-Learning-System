"use client";

import React, { useState } from "react";
import {
  Building2,
  CheckCircle2,
  GraduationCap,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Save,
  ShieldAlert,
  ShieldCheck,
  User,
} from "lucide-react";

import { FIELD_IDS } from "../utils/constants.js";
import {
  updateOwnPassword,
  updateOwnProfile,
} from "../services/settings-admin-service.js";

export function ProfileAccountTab({
  profile,
  onProfileUpdated,
  userEmail,
}) {
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

  const displayName = profile?.full_name || fullName || "Teacher Account";
  const displayEmail = profile?.email || userEmail || "teacher@deped.gov.ph";
  const schoolName = profile?.school_name || "San Jose Elementary School";
  const divisionName = profile?.division_name || "DepEd Division of Rizal";
  const employeeId = profile?.employee_id || "EMP-DEPED-2026";

  // Initials for avatar
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "T";

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. Teacher Display Profile Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-5">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white font-extrabold text-base flex items-center justify-center shadow-xs shrink-0">
            {initials}
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Teacher Profile</h2>
            <p className="text-xs text-slate-500">
              Customize how your name is shown to students and faculty.
            </p>
          </div>
        </div>

        {nameSuccess && (
          <div
            role="status"
            className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Profile name updated successfully!</span>
          </div>
        )}

        {nameError && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium flex items-center gap-2"
          >
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{nameError}</span>
          </div>
        )}

        <form onSubmit={handleSaveName} className="space-y-4">
          <div className="max-w-md space-y-1.5">
            <label
              htmlFor={FIELD_IDS.PROFILE_NAME_INPUT}
              className="text-xs font-bold text-slate-900 block"
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
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden transition-all disabled:opacity-50"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              This name will appear on student reports, activity authoring, and intervention logs.
            </p>
          </div>

          <button
            id={FIELD_IDS.PROFILE_SAVE_BUTTON}
            type="submit"
            disabled={savingName || !fullName.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:cursor-not-allowed"
          >
            {savingName ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving Name...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Profile Name</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* 2. Official DepEd Institutional Assignment (Read-Only) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                DepEd Institutional Assignment
              </h2>
              <p className="text-xs text-slate-500">
                Official school, division, and program credentials.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 uppercase tracking-wider">
            ● Verified Educator
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Mail className="w-3 h-3" /> Official Email
            </span>
            <p className="text-xs font-bold text-slate-800 break-all">{displayEmail}</p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3 h-3" /> Platform Role
            </span>
            <p className="text-xs font-bold text-indigo-700">Teacher / Administrator</p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-3 h-3" /> Assigned School
            </span>
            <p className="text-xs font-bold text-slate-800">{schoolName}</p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <GraduationCap className="w-3 h-3" /> School Division
            </span>
            <p className="text-xs font-bold text-slate-800">{divisionName}</p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Employee ID
            </span>
            <p className="text-xs font-mono font-bold text-slate-700">{employeeId}</p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Curriculum Scope
            </span>
            <p className="text-xs font-bold text-slate-800">Grade 6 Mathematics (DepEd ARAL)</p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-100/80 border border-slate-200/70 text-[11px] text-slate-600 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <span>
            Institutional school assignments and official emails are managed through your DepEd School Directory to protect student privacy and account integrity.
          </span>
        </div>
      </div>

      {/* 3. Account Password & Security */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-5">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <KeyRound className="w-5 h-5 text-indigo-600" />
          <div>
            <h2 className="text-base font-bold text-slate-900">Security & Password</h2>
            <p className="text-xs text-slate-500">
              Update your account password for sign-in security.
            </p>
          </div>
        </div>

        {passwordSuccess && (
          <div
            role="status"
            className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Password updated successfully! You can use your new password next time you sign in.</span>
          </div>
        )}

        {passwordError && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium flex items-center gap-2"
          >
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{passwordError}</span>
          </div>
        )}

        <form onSubmit={handleSavePassword} className="space-y-4 max-w-md">
          <div className="space-y-1.5">
            <label
              htmlFor={FIELD_IDS.PASSWORD_NEW_INPUT}
              className="text-xs font-bold text-slate-900 block"
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
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden transition-all disabled:opacity-50"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={FIELD_IDS.PASSWORD_CONFIRM_INPUT}
              className="text-xs font-bold text-slate-900 block"
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
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden transition-all disabled:opacity-50"
              />
            </div>
          </div>

          <button
            id={FIELD_IDS.PASSWORD_SUBMIT_BUTTON}
            type="submit"
            disabled={savingPassword || !newPassword || !confirmPassword}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-black disabled:bg-slate-400 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:cursor-not-allowed"
          >
            {savingPassword ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Updating Password...</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>Update Password</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
