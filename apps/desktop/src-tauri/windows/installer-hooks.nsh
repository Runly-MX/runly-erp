; Keep the bundle ID and native data directories unchanged. NSIS keys depend on
; productName, so upgrade the former per-user name explicitly before installing.
Var RunlyLegacyDirectory

!macro NSIS_HOOK_PREINSTALL
  Push $R8
  Push $R9
  ReadRegStr $R8 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Runly ERP" "Publisher"
  ${If} $R8 == "racoondevs"
    ReadRegStr $RunlyLegacyDirectory HKCU "Software\racoondevs\Runly ERP" ""
    ${If} $RunlyLegacyDirectory != ""
      IfFileExists "$RunlyLegacyDirectory\runly_erp.exe" 0 runly_legacy_done
      IfFileExists "$RunlyLegacyDirectory\uninstall.exe" 0 runly_legacy_done
      ; /UPDATE preserves the application's data. The old uninstaller closes
      ; the old binary and removes its registration before the new install.
      ExecWait '"$RunlyLegacyDirectory\uninstall.exe" /S /UPDATE _?=$RunlyLegacyDirectory' $R9
      ${If} $R9 != 0
        MessageBox MB_ICONSTOP "No se pudo actualizar la instalación anterior. Cierra Runly y vuelve a ejecutar el instalador." /SD IDOK
        Abort
      ${EndIf}
      ; /UPDATE leaves shortcuts in place; remove only those targeting our app.
      !insertmacro IsShortcutTarget "$SMPROGRAMS\Runly ERP.lnk" "$RunlyLegacyDirectory\runly_erp.exe"
      Pop $R8
      ${If} $R8 == 1
        !insertmacro UnpinShortcut "$SMPROGRAMS\Runly ERP.lnk"
        Delete "$SMPROGRAMS\Runly ERP.lnk"
      ${EndIf}
      !insertmacro IsShortcutTarget "$DESKTOP\Runly ERP.lnk" "$RunlyLegacyDirectory\runly_erp.exe"
      Pop $R8
      ${If} $R8 == 1
        !insertmacro UnpinShortcut "$DESKTOP\Runly ERP.lnk"
        Delete "$DESKTOP\Runly ERP.lnk"
      ${EndIf}
      ; Remove only the known old uninstaller, never application data or resources.
      Delete "$RunlyLegacyDirectory\uninstall.exe"
      RMDir "$RunlyLegacyDirectory"
      DeleteRegKey HKCU "Software\racoondevs\Runly ERP"
    ${EndIf}
  ${EndIf}
  runly_legacy_done:
  Pop $R9
  Pop $R8
!macroend
