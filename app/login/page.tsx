"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/hooks/useAuth";
import { UserRole } from "@/types";
import { AlertCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { loginWithPassword } = useAuth();
  const { language, setLanguage, isRtl } = useLanguage();
  const dir = isRtl ? "rtl" : "ltr";
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

  const dict = {
    en: {
      title: "Sales Portal Sign In",
      desc: "Access your inventory database and manage customer quotations.",
      email: "Email Address",
      password: "Password",
      signIn: "Sign In",
      authenticating: "Authenticating...",
      slogan: <>Precision. <br /> Performance. <br /> <span className="text-[#61989B]">Passion.</span></>,
      sloganDesc: "Supplying premium pharmaceutical care and performance supplements for championship racing stables across the UAE.",
      copyright: "© 2026 MAAT Group Veterinary Trading LLC. All rights reserved.",
      emailInvalid: "Invalid email address",
      passInvalid: "Password must be at least 6 characters",
      authFailed: "Failed to start session. Please try again.",
      incorrectCreds: "Incorrect email or password.",
      emailPlaceholder: "name@example.com"
    },
    ar: {
      title: "تسجيل الدخول لبوابة المبيعات",
      desc: "الوصول إلى قاعدة بيانات المخزون وإدارة عروض أسعار العملاء.",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      signIn: "تسجيل الدخول",
      authenticating: "جاري التحقق...",
      slogan: <>دقة. <br /> أداء. <br /> <span className="text-[#61989B]">شغف.</span></>,
      sloganDesc: "توريد الرعاية الصيدلانية المتميزة والمكملات الغذائية للأداء المتميز لإسطبلات السباق الحائزة على البطولات في جميع أنحاء دولة الإمارات العربية المتحدة.",
      copyright: "© 2026 مجموعة معات للتجارة البيطرية ذ.م.م. جميع الحقوق محفوظة.",
      emailInvalid: "البريد الإلكتروني غير صحيح",
      passInvalid: "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل",
      authFailed: "فشل بدء الجلسة. يرجى المحاولة مرة أخرى.",
      incorrectCreds: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      emailPlaceholder: "name@example.com"
    }
  };

  const t = dict[language];

  const onSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    setErrorMsg(null);

    const result = await loginWithPassword(data.email, data.password);
    if (!result.success) {
      setErrorMsg(result.error || t.incorrectCreds);
    }
    setIsSubmitting(false);
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]" dir={dir}>
      {/* Left Side: Premium Cover Panel */}
      <div className="hidden lg:block lg:w-1/2 relative bg-[#0B1528] overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-95 animate-none" 
          style={{ backgroundImage: `url('/header-bg.png')` }}
        />
        
        {/* Decorative dark navy blue overlay gradient from the left side */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B1528] via-[#0B1528]/75 to-transparent" />
        
        {/* Decorative glassmorphic badge container */}
        <div className="absolute inset-0 flex flex-col justify-between p-16 z-10 text-white">
          <div />

          {/* Slogan */}
          <div className={`space-y-6 max-w-lg ${dir === "rtl" ? "border-r-4 pr-8 border-l-0 pl-0" : "border-l-4 pl-8"} border-[#61989B] py-2`}>
            <h1 className="text-5xl xl:text-6xl font-black leading-tight tracking-tight text-white uppercase">
              {t.slogan}
            </h1>
            <p className="text-base xl:text-lg text-slate-200 font-medium leading-relaxed max-w-md">
              {t.sloganDesc}
            </p>
          </div>

          {/* Footer copyright */}
          <span className="text-xs font-semibold text-white/40">
            {t.copyright}
          </span>
        </div>
      </div>

      {/* Right Side: Login Form Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 md:p-16">
        <div className="w-full max-w-md space-y-6 bg-white p-8 sm:p-10 rounded-3xl border border-slate-200/60 shadow-xl shadow-slate-100/50">
          
          {/* Language Switcher */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setLanguage(language === "en" ? "ar" : "en")}
              className="text-xs font-bold text-accent hover:text-[#4e7d80] transition px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer"
            >
              {language === "en" ? "العربية" : "English"}
            </button>
          </div>

          {/* Header */}
          <div>
            <div className="mx-auto flex items-center justify-center">
              <img 
                src="/logowhte.png" 
                alt="MAAT Logo" 
                className="h-44 object-contain scale-160 my-4" 
                style={{ clipPath: 'inset(0 15% 0 0)' }}
              />
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1B2A4A] text-center">
              {t.title}
            </h2>
            <p className="mt-2 text-sm text-slate-500 font-medium text-center">
              {t.desc}
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
                  {t.email}
                </label>
                <input
                  id="email"
                  type="email"
                  {...register("email")}
                  placeholder={t.emailPlaceholder}
                  className={`w-full px-4 py-3 bg-white border rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all ${
                    errors.email ? "border-rose-300 focus:border-rose-500" : "border-slate-200 focus:border-[#1B2A4A]"
                  }`}
                />
                {errors.email && (
                  <p className="mt-1 text-xs font-semibold text-rose-500">{t.emailInvalid}</p>
                )}
              </div>

              {/* Password Input */}
              <div>
                <label htmlFor="password" className="block text-sm font-bold text-slate-700 mb-1.5">
                  {t.password}
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
                  <p className="mt-1 text-xs font-semibold text-rose-500">{t.passInvalid}</p>
                )}
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full justify-center items-center py-3.5 px-4 text-base font-bold text-white bg-[#1B2A4A] rounded-xl hover:bg-[#15223c] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/25 disabled:opacity-50 transition duration-150 cursor-pointer"
            >
              {isSubmitting ? t.authenticating : t.signIn}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
