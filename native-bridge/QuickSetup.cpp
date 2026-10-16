// MIT. Authored bridge; no game or loader code is redistributed.
// One bounded request on the verified game's own window/Unity thread.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdint>
#include <cstring>
#include <cwchar>
#include <cstdio>
#include <stdexcept>

#pragma pack(push,1)
struct Cosmetic { int32_t ids[6]; uint8_t modded; int32_t stickers[20][4]; };
struct Request {
 uint32_t magic, version, player, operation;
 volatile LONG state; // 0 queued, 1 executing, 2 finished, -1 cancelled before execution
 uint32_t thread, saved, menuRefreshed;
 int32_t presetId, screen;
 Cosmetic baseline, desired, current;
 wchar_t profile[128], error[256], warning[256];
};
#pragma pack(pop)
static_assert(sizeof(Cosmetic)==345 && sizeof(Request)==2355,"Protocol layout changed");
static HMODULE game;
static void* image;
static const char* ids[]={"iCharacterSkinMaterialID","iVehicleMaterialID","iWheelMaterialID","iCharacterSkinMaterialID_Modded","iVehicleMaterialID_Modded","iWheelMaterialID_Modded"};
static const char* stickers[]={"iStickerMaterialID","iStickerMaterialID_SettingsPacked","iStickerMaterialID_Modded","iStickerMaterialID_Modded_SettingsPacked"};
template<typename T> T api(const char* n) { auto f=GetProcAddress(game,n);if(!f)throw std::runtime_error(n);return reinterpret_cast<T>(f); }
static void* type(const char* n) { auto c=api<void*(*)(void*,const char*,const char*)>("il2cpp_class_from_name")(image,"",n);if(!c)throw std::runtime_error(n);return c; }
static void* klass(void* o) { if(!o)throw std::runtime_error("Game object unavailable");return api<void*(*)(void*)>("il2cpp_object_get_class")(o); }
static void* field(void* c,const char* n) { auto f=api<void*(*)(void*,const char*)>("il2cpp_class_get_field_from_name")(c,n);if(!f)throw std::runtime_error(n);return f; }
template<typename T> T read(void* o,const char* n){T v{};api<void(*)(void*,void*,void*)>("il2cpp_field_get_value")(o,field(klass(o),n),&v);return v;}
template<typename T> T staticRead(void* c,const char* n){T v{};api<void(*)(void*,void*)>("il2cpp_field_static_get_value")(field(c,n),&v);return v;}
template<typename T> void write(void* o,const char* n,T v){api<void(*)(void*,void*,void*)>("il2cpp_field_set_value")(o,field(klass(o),n),&v);}
static void* invoke(void* c,void* o,const char* n,int count=0,void** args=nullptr){
 auto m=api<void*(*)(void*,const char*,int)>("il2cpp_class_get_method_from_name")(c,n,count);if(!m)throw std::runtime_error(n);void* ex=nullptr;
 auto result=api<void*(*)(void*,void*,void**,void**)>("il2cpp_runtime_invoke")(m,o,args,&ex);
 if(ex)throw std::runtime_error("The game rejected an operation. Reopen Quick Setup to review its current state.");return result;
}
template<typename T> T unbox(void* v){if(!v)throw std::runtime_error("Missing game result");return *static_cast<T*>(api<void*(*)(void*)>("il2cpp_object_unbox")(v));}
static void* at(void* a,uint32_t i){if(!a || api<uintptr_t(*)(void*)>("il2cpp_array_length")(a)<=i)throw std::runtime_error("Game slot unavailable");return reinterpret_cast<void**>(static_cast<char*>(a)+32)[i];}
static Cosmetic snapshot(void* p){Cosmetic c{};for(int i=0;i<6;i++)c.ids[i]=read<int32_t>(p,ids[i]);c.modded=read<bool>(p,"bUsingModdedVersion");auto a=read<void*>(p,"stickersData");
 if(!a || api<uintptr_t(*)(void*)>("il2cpp_array_length")(a)!=20)throw std::runtime_error("Unsupported sticker array");
 for(int i=0;i<20;i++)for(int j=0;j<4;j++)c.stickers[i][j]=read<int32_t>(at(a,i),stickers[j]);return c;}
static void apply(void* p,const Cosmetic& c){for(int i=0;i<6;i++)write<int32_t>(p,ids[i],c.ids[i]);write<bool>(p,"bUsingModdedVersion",c.modded!=0);auto a=read<void*>(p,"stickersData");for(int i=0;i<20;i++)for(int j=0;j<4;j++)write<int32_t>(at(a,i),stickers[j],c.stickers[i][j]);}
static bool same(const Cosmetic& a,const Cosmetic& b){return memcmp(&a,&b,sizeof(Cosmetic))==0;}
static void valid(void* config,const char* n,int id){void* args[]={&id};auto list=read<void*>(config,n);if(!unbox<bool>(invoke(klass(list),list,"ContainsConfigID",1,args)))throw std::runtime_error("A chosen appearance is not loaded in the game. Install it and restart the game before using it.");}
static void validate(const Cosmetic& c){auto config=invoke(type("TK_GameConfig"),nullptr,"get_Data");for(int i=0;i<6;i++)valid(config,i%3==0?"characterSkinsMaterial":i%3==1?"KartSkins":"WheelsMaterial",c.ids[i]);for(int i=0;i<20;i++){if(c.stickers[i][0]!=-1)valid(config,"StickerMaterials",c.stickers[i][0]);if(c.stickers[i][2]!=-1)valid(config,"StickerMaterials",c.stickers[i][2]);}}
static void run(Request* r){
 try{
  if(r->magic!=0x42475153 || r->version!=1 || r->player>=6 || r->operation>1 || r->profile[127] || r->baseline.modded>1 || r->desired.modded>1)throw std::runtime_error("Invalid Quick Setup request");
  r->thread=GetCurrentThreadId();game=GetModuleHandleW(L"GameAssembly.dll");if(!game)throw std::runtime_error("The game runtime is unavailable");
  if(!api<void*(*)()>("il2cpp_thread_current")())throw std::runtime_error("Not on the game runtime thread");
  auto d=api<void*(*)()>("il2cpp_domain_get")();size_t count=0;auto assemblies=api<void**(*)(void*,size_t*)>("il2cpp_domain_get_assemblies")(d,&count);void* unity=nullptr;
  for(size_t i=0;i<count;i++){auto im=api<void*(*)(void*)>("il2cpp_assembly_get_image")(assemblies[i]);auto n=api<const char*(*)(void*)>("il2cpp_image_get_name")(im);if(!strcmp(n,"Assembly-CSharp.dll"))image=im;if(!strcmp(n,"UnityEngine.CoreModule.dll"))unity=im;}
  if(!image || !unity)throw std::runtime_error("Game assemblies unavailable");
  auto go=api<void*(*)(void*,const char*,const char*)>("il2cpp_class_from_name")(unity,"UnityEngine","GameObject");
  void* query=api<void*(*)(const char*)>("il2cpp_string_new")("__BobbysGarage_MainThreadCheck__");void* args[]={query};invoke(go,nullptr,"Find",1,args);
  auto profile=staticRead<void*>(type("PTK_PlayerProfile"),"Instance");if(!read<bool>(profile,"bIsProfileDataLoaded"))throw std::runtime_error("Game profile not loaded");
  auto name=invoke(klass(profile),profile,"get_strLocalSaveFileName");auto len=api<int(*)(void*)>("il2cpp_string_length")(name);auto chars=api<const wchar_t*(*)(void*)>("il2cpp_string_chars")(name);
  if(len<1 || len>=128 || static_cast<size_t>(len)!=wcslen(r->profile) || wmemcmp(chars,r->profile,len))throw std::runtime_error("The running game uses another profile. Refresh Steam and reopen Quick Setup.");
  auto data=read<void*>(read<void*>(profile,"localNotSafeData"),"profileData");auto slot=at(read<void*>(data,"QuickCreationPresets"),r->player);
  if(!read<bool>(slot,"BQuickPresetInitialized"))throw std::runtime_error("Quick Setup is uninitialized");auto preset=read<void*>(slot,"QuickPreset");
  if(read<int32_t>(preset,"iPresetID")!=r->presetId)throw std::runtime_error("The Quick Setup identity changed");r->current=snapshot(preset);
  auto menuType=type("MenuManager");auto menu=staticRead<void*>(menuType,"Instance");bool inMenu=false;void* manager=nullptr;bool editing=false;
  try{inMenu=menu && unbox<bool>(invoke(klass(menu),menu,"get_isActiveAndEnabled"));}catch(...){inMenu=false;}
  if(inMenu){r->screen=staticRead<int32_t>(menuType,"_eCurrentMenuScreenType");manager=read<void*>(menu,"mainMenuPresetsManager");
   if(manager && (r->screen==106 || r->screen==115) && unbox<int32_t>(invoke(klass(menu),menu,"GetPresetEditorTargetLocalPlayer"))==static_cast<int32_t>(r->player))editing=unbox<bool>(invoke(klass(manager),manager,"IsQuickPresetBeingEdited"));}
  if(!r->operation)return;
  if(!same(r->current,r->baseline))throw std::runtime_error("Quick Setup changed in the game. Reopen it to review the latest setup; your draft was not written.");
  validate(r->desired);
  if(editing && r->desired.modded!=r->baseline.modded)throw std::runtime_error("Switch Original/Modded in the game before changing its active view. Your draft was not written.");
  if(editing){for(auto n:{"customizationScreenEnterSavedPreset","customizationElementsClickedApprovedPreset","presetForCurrentItemsSelecting"})if(!same(snapshot(read<void*>(manager,n)),r->baseline))throw std::runtime_error("Quick Setup has unsaved edits in the game. Confirm or cancel those edits first.");}
  // Validate everything before mutating only existing scalar cosmetic fields.
  apply(preset,r->desired);
  try{invoke(klass(profile),profile,"SaveProfileLocalData");r->saved=1;}
  catch(...){apply(preset,r->baseline);try{invoke(klass(profile),profile,"SaveProfileLocalData");}catch(...){}throw;}
  if(inMenu){try{
    auto sync=staticRead<void*>(type("Ant_CurrentGameConfiguration"),"playersCustomization");int32_t player=r->player;void* getArgs[]={&player};auto active=invoke(klass(sync),sync,"GetPlayerData___LOCAL_PC_PLAYER",1,getArgs);
    if(active && read<int32_t>(active,"iPresetID")==r->presetId){bool force=false;void* setArgs[]={&player,preset,&force};invoke(klass(sync),sync,"SetDataFor_LOCAL_Player",3,setArgs);}
    if(editing){invoke(klass(manager),manager,"LoadQuickPresetForEditing");r->menuRefreshed=1;}
   }catch(...){wcscpy_s(r->warning,L"Saved. Reopen Quick Setup in the game to refresh its preview.");}}
  else wcscpy_s(r->warning,L"Saved for the next Quick Setup selection. The current race is unchanged.");
  r->current=snapshot(preset);
 }catch(const std::exception& e){MultiByteToWideChar(CP_UTF8,0,e.what(),-1,r->error,256);}
}
static void safeRun(Request* r){__try{run(r);}__except(EXCEPTION_EXECUTE_HANDLER){wcscpy_s(r->error,L"The bridge rejected an incompatible game runtime. Refresh the setup before retrying.");}}
extern "C" __declspec(dllexport) LRESULT CALLBACK GarageQuickSetup(int code,WPARAM w,LPARAM l){
 if(code>=0 && w==PM_REMOVE){auto msg=reinterpret_cast<MSG*>(l);if(msg && msg->message==RegisterWindowMessageW(L"BobbysGarage.QuickSetup.v1")){
  wchar_t name[128];swprintf_s(name,L"Local\\BobbysGarageQuick_%lu_%llx",GetCurrentProcessId(),static_cast<unsigned long long>(msg->wParam));auto h=OpenFileMappingW(FILE_MAP_ALL_ACCESS,FALSE,name);
  if(h){auto r=static_cast<Request*>(MapViewOfFile(h,FILE_MAP_ALL_ACCESS,0,0,sizeof(Request)));if(r){if(InterlockedCompareExchange(&r->state,1,0)==0){safeRun(r);InterlockedExchange(&r->state,2);}UnmapViewOfFile(r);}CloseHandle(h);}
 }}return CallNextHookEx(nullptr,code,w,l);
}

extern "C" __declspec(dllexport) LONG GarageCancel(Request* r){return InterlockedCompareExchange(&r->state,-1,0);}
