; =====================================================================
;  Asistencia QR - instalador para Windows
;
;  Empaqueta la aplicacion, instala Node.js si el equipo no lo tiene,
;  descarga las librerias y crea la base de datos. El usuario solo
;  ejecuta el .exe y responde dos preguntas.
;
;  Compilar:  scripts\construir-instalador.ps1
; =====================================================================

#define Nombre        "Asistencia QR"
#define Version       "2.0.0"
#define Autor         "Jose Duran"
#define Sitio         "https://github.com/Losif24/AsistenciaQR"
#define Ejecutable    "iniciar.bat"

[Setup]
AppId={{7B3C9E41-2D8A-4F65-9C17-A0E4D62B8F33}
AppName={#Nombre}
AppVersion={#Version}
AppVerName={#Nombre} {#Version}
AppPublisher={#Autor}
AppPublisherURL={#Sitio}
AppSupportURL={#Sitio}/issues
AppUpdatesURL={#Sitio}/releases

DefaultDirName={autopf}\AsistenciaQR
DefaultGroupName={#Nombre}
DisableProgramGroupPage=yes
DisableDirPage=no
AllowNoIcons=yes

OutputDir=..\dist
OutputBaseFilename=AsistenciaQR-{#Version}-instalador
SetupIconFile=asistencia.ico
UninstallDisplayIcon={app}\installer\asistencia.ico
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes

; Node.js se instala por MSI y los accesos van a Archivos de programa.
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0

LicenseFile=..\LICENSE
InfoBeforeFile=antes-de-instalar.txt

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "escritorio";  Description: "Crear un acceso directo en el escritorio"; GroupDescription: "Accesos directos:"
Name: "autoarranque"; Description: "Iniciar Asistencia QR al encender el equipo"; GroupDescription: "Opciones:"; Flags: unchecked
Name: "cortafuegos";  Description: "Permitir el acceso desde otros equipos de la red local"; GroupDescription: "Opciones:"

[Files]
; Aplicacion. node_modules no se empaqueta: npm lo resuelve en destino,
; asi los binarios corresponden siempre al Node que hay en ese equipo.
Source: "..\src\*";        DestDir: "{app}\src";        Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\public\*";     DestDir: "{app}\public";     Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\scripts\*";    DestDir: "{app}\scripts";    Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\docs\*";       DestDir: "{app}\docs";       Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist
Source: "..\package.json";      DestDir: "{app}"; Flags: ignoreversion
Source: "..\package-lock.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\.env.example";      DestDir: "{app}"; Flags: ignoreversion
Source: "..\iniciar.bat";       DestDir: "{app}"; Flags: ignoreversion
Source: "..\instalar.bat";      DestDir: "{app}"; Flags: ignoreversion
Source: "..\LICENSE";           DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md";         DestDir: "{app}"; Flags: ignoreversion
Source: "asistencia.ico";       DestDir: "{app}\installer"; Flags: ignoreversion

; MSI de Node.js opcional: si esta junto al .iss se empaqueta y el equipo
; de destino no necesita internet para instalar Node.
Source: "node-lts.msi"; DestDir: "{tmp}"; Flags: deleteafterinstall skipifsourcedoesntexist

[Icons]
Name: "{group}\{#Nombre}";            Filename: "{app}\{#Ejecutable}"; WorkingDir: "{app}"; IconFilename: "{app}\installer\asistencia.ico"
Name: "{group}\Carpeta de datos";     Filename: "{app}\data"
Name: "{group}\Desinstalar {#Nombre}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#Nombre}";      Filename: "{app}\{#Ejecutable}"; WorkingDir: "{app}"; IconFilename: "{app}\installer\asistencia.ico"; Tasks: escritorio
; El instalador corre elevado, asi que {userstartup} apuntaria al perfil del
; administrador. {commonstartup} arranca el sistema entre a quien entre.
Name: "{commonstartup}\{#Nombre}";    Filename: "{app}\{#Ejecutable}"; WorkingDir: "{app}"; IconFilename: "{app}\installer\asistencia.ico"; Tasks: autoarranque

[Run]
; La preparacion pesada la hace el script de PowerShell: Node, npm y el esquema.
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\scripts\instalar.ps1"" -Puerto {code:ObtenerPuerto} -Organizacion ""{code:ObtenerOrganizacion}"" -NodeMsi ""{code:ObtenerNodeMsi}"" -SinAccesosDirectos -Silencioso"; \
  StatusMsg: "Instalando Node.js, librerias y base de datos. Puede tardar varios minutos..."; \
  Flags: waituntilterminated runhidden

Filename: "netsh.exe"; \
  Parameters: "advfirewall firewall add rule name=""Asistencia QR"" dir=in action=allow protocol=TCP localport={code:ObtenerPuerto}"; \
  Flags: runhidden waituntilterminated; Tasks: cortafuegos

Filename: "{app}\{#Ejecutable}"; Description: "Abrir Asistencia QR ahora"; \
  Flags: postinstall shellexec skipifsilent nowait

[UninstallDelete]
Type: filesandordirs; Name: "{app}\node_modules"

[UninstallRun]
Filename: "netsh.exe"; Parameters: "advfirewall firewall delete rule name=""Asistencia QR"""; Flags: runhidden; RunOnceId: "QuitarReglaCortafuegos"

[Code]
var
  PaginaAjustes: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  PaginaAjustes := CreateInputQueryPage(wpSelectTasks,
    'Datos de la organizacion',
    'Como debe presentarse el sistema',
    'Estos datos aparecen en la pantalla de inicio y en los reportes. ' +
    'Podra cambiarlos mas adelante editando el archivo .env.');

  PaginaAjustes.Add('Nombre de la organizacion:', False);
  PaginaAjustes.Add('Puerto del servidor (deje 4090 si no sabe cual usar):', False);

  PaginaAjustes.Values[0] := 'Mi Organizacion';
  PaginaAjustes.Values[1] := '4090';
end;

function NextButtonClick(PaginaActual: Integer): Boolean;
var
  Puerto: Integer;
begin
  Result := True;
  if PaginaActual = PaginaAjustes.ID then
  begin
    if Trim(PaginaAjustes.Values[0]) = '' then
    begin
      MsgBox('Escriba el nombre de la organizacion.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    Puerto := StrToIntDef(Trim(PaginaAjustes.Values[1]), 0);
    if (Puerto < 1024) or (Puerto > 65535) then
    begin
      MsgBox('El puerto debe ser un numero entre 1024 y 65535.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

function ObtenerPuerto(Parametro: String): String;
begin
  Result := Trim(PaginaAjustes.Values[1]);
end;

function ObtenerOrganizacion(Parametro: String): String;
begin
  Result := Trim(PaginaAjustes.Values[0]);
end;

{ Si se empaqueto el MSI de Node se pasa su ruta; si no, cadena vacia
  y el script lo descarga de nodejs.org. }
function ObtenerNodeMsi(Parametro: String): String;
begin
  if FileExists(ExpandConstant('{tmp}\node-lts.msi')) then
    Result := ExpandConstant('{tmp}\node-lts.msi')
  else
    Result := '';
end;

{ Al desinstalar se pregunta por los datos: borrarlos es irreversible. }
procedure CurUninstallStepChanged(PasoActual: TUninstallStep);
var
  CarpetaDatos: String;
begin
  if PasoActual = usPostUninstall then
  begin
    CarpetaDatos := ExpandConstant('{app}\data');
    if DirExists(CarpetaDatos) then
    begin
      if MsgBox('Desea borrar tambien la base de datos con todo el historico de asistencia?' + #13#10#13#10 +
                'Si responde No, los datos quedaran en:' + #13#10 + CarpetaDatos,
                mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
        DelTree(CarpetaDatos, True, True, True);
    end;
  end;
end;
