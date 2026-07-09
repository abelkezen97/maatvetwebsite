"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/hooks/useAuth";
import { UserRole } from "@/types";
import { AlertCircle } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    setErrorMsg(null);

    // Determine role dynamically based on the email address
    let determinedRole: UserRole = "Salesman";
    if (data.email.toLowerCase() === "admin@maatvet.com") {
      determinedRole = "Admin";
    }

    const isValidAdmin =
      determinedRole === "Admin" &&
      data.email.toLowerCase() === "admin@maatvet.com" &&
      data.password === "admin123";

    const isValidSalesman =
      determinedRole === "Salesman" &&
      data.email.toLowerCase() === "kaleem@maatvet.com" &&
      data.password === "sales123";

    if (isValidAdmin || isValidSalesman) {
      const success = await login(data.email, determinedRole);
      if (!success) {
        setErrorMsg("Failed to start session. Please try again.");
      }
    } else {
      setErrorMsg("Incorrect email or password.");
    }
    setIsSubmitting(false);
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      {/* Left Side: Premium Cover Panel */}
      <div className="hidden lg:block lg:w-1/2 relative bg-[#0B1528] overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-95" 
          style={{ backgroundImage: `url('/bluebgmaatveb.png')` }}
        />
        
        {/* Decorative dark navy blue overlay gradient from the left side */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B1528] via-[#0B1528]/75 to-transparent" />
        
        {/* Decorative glassmorphic badge container */}
        <div className="absolute inset-0 flex flex-col justify-between p-16 z-10 text-white">
          {/* Spacer to keep alignment */}
          <div />

          {/* Slogan */}
          <div className="space-y-6 max-w-lg border-l-4 border-[#61989B] pl-8 py-2">
            <h1 className="text-5xl xl:text-6xl font-black leading-tight tracking-tight text-white uppercase">
              Precision. <br />
              Performance. <br />
              <span className="text-[#61989B]">Passion.</span>
            </h1>
            <p className="text-base xl:text-lg text-slate-200 font-medium leading-relaxed max-w-md">
              Supplying premium pharmaceutical care and performance supplements for championship racing stables across the UAE.
            </p>
          </div>

          {/* Footer copyright */}
          <span className="text-xs font-semibold text-white/40">
            © 2026 MAAT Group Veterinary Trading LLC. All rights reserved.
          </span>
        </div>
      </div>

      {/* Right Side: Login Form Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 md:p-16">
        <div className="w-full max-w-md space-y-8 bg-white p-8 sm:p-10 rounded-3xl border border-slate-200/60 shadow-xl shadow-slate-100/50">
          {/* Header */}
          <div>
            <div className="mx-auto flex items-center justify-center">
              <img 
                src="/logowhte.png" 
                alt="MAAT Logo" 
                className="h-32 object-contain scale-135 my-4" 
                style={{ clipPath: 'inset(0 15% 0 0)' }}
              />
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1B2A4A] text-center">
              Sales Portal Sign In
            </h2>
            <p className="mt-2 text-sm text-slate-500 font-medium text-center">
              Access your inventory database and manage customer quotations.
            </p>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="flex items-center gap-2.5 rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span className="font-semibold">{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              {/* Email Input */}
              <div>
                <label htmlFor="email" className="block text-sm font-bold text-slate-700 mb-1.5">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  {...register("email")}
                  placeholder="name@example.com"
                  className={`w-full px-4 py-3 bg-white border rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all ${
                    errors.email ? "border-rose-300 focus:border-rose-500" : "border-slate-200 focus:border-[#1B2A4A]"
                  }`}
                />
                {errors.email && (
                  <p className="mt-1 text-xs font-semibold text-rose-500">{errors.email.message}</p>
                )}
              </div>

              {/* Password Input */}
              <div>
                <label htmlFor="password" className="block text-sm font-bold text-slate-700 mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  {...register("password")}
                  placeholder="••••••••"
                  className={`w-full px-4 py-3 bg-white border rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all ${
                    errors.password ? "border-rose-300 focus:border-rose-500" : "border-slate-200 focus:border-[#1B2A4A]"
                  }`}
                />
                {errors.password && (
                  <p className="mt-1 text-xs font-semibold text-rose-500">{errors.password.message}</p>
                )}
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full justify-center items-center py-3.5 px-4 text-base font-bold text-white bg-[#1B2A4A] rounded-xl hover:bg-[#15223c] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/25 disabled:opacity-50 transition duration-150 cursor-pointer"
            >
              {isSubmitting ? "Authenticating..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
