// MIT. Authored bridge; no game or loader code is redistributed.
// One bounded request on the verified game's own window/Unity thread.
#define WIN32_LEAN_AND_MEAN
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <cwchar>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>
#include <windows.h>

#pragma pack(push, 1)
struct Cosmetic {
  int32_t ids[6];
  uint8_t modded;
  int32_t stickers[20][4];
};
struct LobbyEntry {
  int32_t player, flags, presetId;
  Cosmetic data;
  wchar_t name[96], identity[128];
};
struct Request {
  uint32_t magic, version, player, operation;
  volatile LONG state; // 0 queued, 1 executing, 2 finished, -1 cancelled before execution
  uint32_t thread, saved, menuRefreshed;
  int32_t presetId, screen;
  Cosmetic baseline, desired, current;
  wchar_t profile[128], error[256], warning[256];
  uint32_t lobbyCount, inLobby;
  wchar_t targetIdentity[128];
  LobbyEntry lobby[32];
  uint32_t payloadBytes, responseBytes, responseCapacity;
};
#pragma pack(pop)
static_assert(sizeof(Cosmetic) == 345 && sizeof(Request) == 28391, "Protocol layout changed");
static HMODULE game;
static void *image;
static void *unityImage;
static void *jsonImage;
static const char *ids[] = {"iCharacterSkinMaterialID",  "iVehicleMaterialID",
                            "iWheelMaterialID",          "iCharacterSkinMaterialID_Modded",
                            "iVehicleMaterialID_Modded", "iWheelMaterialID_Modded"};
static const char *stickers[] = {"iStickerMaterialID", "iStickerMaterialID_SettingsPacked",
                                 "iStickerMaterialID_Modded",
                                 "iStickerMaterialID_Modded_SettingsPacked"};
template <typename T> T api(const char *n) {
  auto f = GetProcAddress(game, n);
  if (!f)
    throw std::runtime_error(n);
  return reinterpret_cast<T>(f);
}
static void *type(const char *n) {
  auto c =
      api<void *(*)(void *, const char *, const char *)>("il2cpp_class_from_name")(image, "", n);
  if (!c)
    throw std::runtime_error(n);
  return c;
}
static void *klass(void *o) {
  if (!o)
    throw std::runtime_error("Game object unavailable");
  return api<void *(*)(void *)>("il2cpp_object_get_class")(o);
}
static void *field(void *c, const char *n) {
  auto f = api<void *(*)(void *, const char *)>("il2cpp_class_get_field_from_name")(c, n);
  if (!f)
    throw std::runtime_error(n);
  return f;
}
template <typename T> T read(void *o, const char *n) {
  T v{};
  api<void (*)(void *, void *, void *)>("il2cpp_field_get_value")(o, field(klass(o), n), &v);
  return v;
}
template <typename T> T staticRead(void *c, const char *n) {
  T v{};
  api<void (*)(void *, void *)>("il2cpp_field_static_get_value")(field(c, n), &v);
  return v;
}
template <typename T> void write(void *o, const char *n, T v) {
  api<void (*)(void *, void *, void *)>("il2cpp_field_set_value")(o, field(klass(o), n), &v);
}
template<> void write<void*>(void* o,const char* n,void* v){api<void(*)(void*,void*,void*)>("il2cpp_field_set_value_object")(o,field(klass(o),n),v);}
static void *invoke(void *c, void *o, const char *n, int count = 0, void **args = nullptr) {
  auto m =
      api<void *(*)(void *, const char *, int)>("il2cpp_class_get_method_from_name")(c, n, count);
  if (!m)
    throw std::runtime_error(n);
  void *ex = nullptr;
  auto result =
      api<void *(*)(void *, void *, void **, void **)>("il2cpp_runtime_invoke")(m, o, args, &ex);
  if (ex)
    throw std::runtime_error("The game could not complete this operation. Return to its menu and "
                             "refresh Garage before retrying.");
  return result;
}
static void *findUnityObject(void *object, void *target) {
  void *iterator = nullptr;
  void *method = nullptr;
  while (auto candidate =
             api<void *(*)(void *, void **)>("il2cpp_class_get_methods")(object, &iterator)) {
    if (strcmp(api<const char *(*)(void *)>("il2cpp_method_get_name")(candidate),
               "FindObjectOfType") ||
        api<uint32_t (*)(void *)>("il2cpp_method_get_param_count")(candidate) != 1)
      continue;
    auto parameter = api<void *(*)(void *, uint32_t)>("il2cpp_method_get_param")(candidate, 0);
    auto name = api<char *(*)(void *)>("il2cpp_type_get_name")(parameter);
    bool match = name && !strcmp(name, "System.Type");
    if (name)
      api<void (*)(void *)>("il2cpp_free")(name);
    if (match) {
      method = candidate;
      break;
    }
  }
  if (!method)
    throw std::runtime_error("The lobby component lookup is unavailable in this game build.");
  void *args[] = {target};
  void *exception = nullptr;
  auto result = api<void *(*)(void *, void *, void **, void **)>("il2cpp_runtime_invoke")(
      method, nullptr, args, &exception);
  if (exception)
    throw std::runtime_error(
        "The game could not read its lobby components. Return to the lobby and refresh players.");
  return result;
}
template <typename T> T unbox(void *v) {
  if (!v)
    throw std::runtime_error("Missing game result");
  return *static_cast<T *>(api<void *(*)(void *)>("il2cpp_object_unbox")(v));
}
static bool unityAlive(void* value){
 if(!value)return false;
 auto object=api<void*(*)(void*,const char*,const char*)>("il2cpp_class_from_name")(unityImage,"UnityEngine","Object");
 void* args[]={value};return unbox<bool>(invoke(object,nullptr,"op_Implicit",1,args));
}
static void *at(void *a, uint32_t i) {
  if (!a || api<uintptr_t (*)(void *)>("il2cpp_array_length")(a) <= i)
    throw std::runtime_error("Game slot unavailable");
  return reinterpret_cast<void **>(static_cast<char *>(a) + 32)[i];
}
static Cosmetic snapshot(void *p) {
  Cosmetic c{};
  for (int i = 0; i < 6; i++)
    c.ids[i] = read<int32_t>(p, ids[i]);
  c.modded = read<bool>(p, "bUsingModdedVersion");
  auto a = read<void *>(p, "stickersData");
  if (!a || api<uintptr_t (*)(void *)>("il2cpp_array_length")(a) != 20)
    throw std::runtime_error("Unsupported sticker array");
  for (int i = 0; i < 20; i++)
    for (int j = 0; j < 4; j++)
      c.stickers[i][j] = read<int32_t>(at(a, i), stickers[j]);
  return c;
}
static void apply(void *p, const Cosmetic &c) {
  for (int i = 0; i < 6; i++)
    write<int32_t>(p, ids[i], c.ids[i]);
  write<bool>(p, "bUsingModdedVersion", c.modded != 0);
  auto a = read<void *>(p, "stickersData");
  for (int i = 0; i < 20; i++)
    for (int j = 0; j < 4; j++)
      write<int32_t>(at(a, i), stickers[j], c.stickers[i][j]);
}
static bool same(const Cosmetic &a, const Cosmetic &b) {
  return memcmp(&a, &b, sizeof(Cosmetic)) == 0;
}
static void valid(void *config, const char *n, int id) {
  void *args[] = {&id};
  auto list = read<void *>(config, n);
  if (!unbox<bool>(invoke(klass(list), list, "ContainsConfigID", 1, args)))
    throw std::runtime_error("A chosen appearance is not loaded in the game. Install it and "
                             "restart the game before using it.");
}
static void validate(const Cosmetic &c) {
  auto config = invoke(type("TK_GameConfig"), nullptr, "get_Data");
  // The game resolves missing/zero modded references to these original bases.
  // Preserve the raw modded IDs when copying; absence is not corrupt data.
  for (int i = 0; i < 3; i++)
    valid(config,
          i % 3 == 0   ? "characterSkinsMaterial"
          : i % 3 == 1 ? "KartSkins"
                       : "WheelsMaterial",
          c.ids[i]);
  for (int i = 0; i < 20; i++) {
    if (c.stickers[i][0] != -1)
      valid(config, "StickerMaterials", c.stickers[i][0]);
  }
}
static void text(void *str, wchar_t *dest, size_t capacity) {
  if (!str) {
    dest[0] = 0;
    return;
  }
  auto length = api<int (*)(void *)>("il2cpp_string_length")(str);
  auto chars = api<const wchar_t *(*)(void *)>("il2cpp_string_chars")(str);
  if (length < 0 || static_cast<size_t>(length) >= capacity)
    throw std::runtime_error("A lobby identity is longer than supported");
  wmemcpy(dest, chars, length);
  dest[length] = 0;
}
static void *globalPreset(int32_t player) {
  auto sync = staticRead<void *>(type("Ant_CurrentGameConfiguration"), "playersCustomization");
  void *args[] = {&player};
  return invoke(klass(sync), sync, "GetPlayerData___GLOBAL_SYNCED_PLAYER", 1, args);
}
static void response(Request*,const std::string&);
static std::string entryMetadata;
static std::vector<void*> autoQueues(){
 std::vector<void*> queues;auto append=[&](void* list){if(!list)return;auto count=unbox<int32_t>(invoke(klass(list),list,"get_Count"));if(count<0 || count>64)throw std::runtime_error("Unsupported automatic download queue count.");for(int32_t i=0;i<count;i++){void* args[]={&i};auto queue=invoke(klass(list),list,"get_Item",1,args);if(queue)queues.push_back(queue);}};
 auto manager=staticRead<void*>(type("PTK_LobbyAutoDownloadManager"),"<Instance>k__BackingField");if(manager)append(read<void*>(manager,"_queues"));
 auto orphanField=api<void*(*)(void*,const char*)>("il2cpp_class_get_field_from_name")(type("PTK_LobbyAutoDownloadManager"),"_orphanedDownloads");if(orphanField){void* orphans=nullptr;api<void(*)(void*,void*)>("il2cpp_field_static_get_value")(orphanField,&orphans);if(orphans){auto count=unbox<int32_t>(invoke(klass(orphans),orphans,"get_Count"));if(count<0 || count>64)throw std::runtime_error("Unsupported orphaned download count.");for(int32_t i=0;i<count;i++){void* args[]={&i};auto orphan=invoke(klass(orphans),orphans,"get_Item",1,args);if(orphan)append(read<void*>(orphan,"queues"));}}}return queues;
}
static bool temporarilyOwned(int64_t id){for(auto queue:autoQueues()){auto list=read<void*>(queue,"_downloadedItems");auto count=unbox<int32_t>(invoke(klass(list),list,"get_Count"));for(int32_t i=0;i<count;i++){void* args[]={&i};auto item=invoke(klass(list),list,"get_Item",1,args);if(item && read<int64_t>(item,"modId")==id)return true;}}return false;}
static void cacheMetadata(void* player,const LobbyEntry& entry){
 // This cache is unpacked from the actual remote player's detailed Photon property.
 // Box its nullable value through IL2CPP, without assuming native struct offsets.
 auto cache=api<void*(*)(void*,const char*)>("il2cpp_class_get_field_from_name")(klass(player),"_lastQueuedCustomizationDetails");if(!cache)return;
 auto detail=api<void*(*)(void*,void*)>("il2cpp_field_get_value_object")(cache,player);if(!detail)return;
 if(!api<void*(*)(void*,const char*)>("il2cpp_class_get_field_from_name")(klass(detail),"ConfigIds")){if(!unbox<bool>(invoke(klass(detail),detail,"get_HasValue")))return;detail=invoke(klass(detail),detail,"get_Value");}
 if(!detail || read<uint8_t>(detail,"ConfigsMods_idPlatformType")!=0)return;
 auto configs=read<void*>(detail,"ConfigIds"), mods=read<void*>(detail,"ConfigsMods_ulIds");if(!configs || !mods)return;
 auto count=api<uintptr_t(*)(void*)>("il2cpp_array_length")(configs);if(count>64 || api<uintptr_t(*)(void*)>("il2cpp_array_length")(mods)!=count)return;
 std::string parts;const char* names[]={"characters","vehicles","wheels"};auto configValues=reinterpret_cast<int32_t*>(static_cast<char*>(configs)+32);auto modValues=reinterpret_cast<int64_t*>(static_cast<char*>(mods)+32);
 for(int kind=0;kind<3;kind++){if(!entry.data.modded || !entry.data.ids[kind+3])continue;int64_t id=0;for(uintptr_t i=0;i<count;i++)if(configValues[i]==entry.data.ids[kind+3] && modValues[i]>0){if(id && id!=modValues[i]){id=0;break;}id=modValues[i];}if(!id)continue;if(!parts.empty())parts+=",";parts+=std::string("\"")+names[kind]+"\":{\"id\":\""+std::to_string(id)+"\",\"temporary\":"+(temporarilyOwned(id)?"true":"false")+"}";}
 if(!parts.empty()){if(!entryMetadata.empty())entryMetadata+=",";entryMetadata+="\""+std::to_string(entry.player)+"\":{\"workshop\":{"+parts+"}}";}
}
static bool roomOwner(void* network){return network && unbox<bool>(invoke(klass(network),network,"IsLocalPlayerRoomOwner"));}
static void lobbyExtras(Request* r,bool inRace,bool host){
 auto settings=invoke(type("Ant_CurrentGameConfiguration"),nullptr,"get_kartersSettingsData");
 std::string json=std::string("{\"inRace\":")+(inRace?"true":"false")+",\"host\":"+(host?"true":"false")+",\"settings\":{";
 const char* fields[]={"eAutoDownloadTracks","eAutoDownloadPresets","eAutoDownloadKeep"};const char* names[]={"autoDownloadTracks","autoDownloadPresets","keepAutoDownloaded"};
 for(int i=0;i<3;i++){auto setting=read<void*>(settings,fields[i]);auto value=unbox<bool>(invoke(klass(setting),setting,"GetBoolValue"));if(i)json+=",";json+=std::string("\"")+names[i]+"\":"+(value?"true":"false");}json+="},\"entryMetadata\":{"+entryMetadata+"}}";response(r,json);
}
static void saveLobbyPreset(Request*,void*,void*,bool);
static bool raceLobby(Request* r,void* profile,void* network,bool online){
 // Unity leaves managed static references alive after destroying the native
 // component. Its implicit-bool operator checks that native lifetime safely.
 // A surviving inactive race may still provide the actual results roster.
 auto race=staticRead<void*>(type("Ant_MainGame"),"Instance");if(!unityAlive(race))return false;
 auto players=read<void*>(race,"antMainGamePlayers");if(!players)return false;
 auto list=invoke(klass(players),players,"GetCurrentlyPlayingPlayers");if(!list)return false;
 auto count=unbox<int32_t>(invoke(klass(list),list,"get_Count"));if(count<0 || count>32)throw std::runtime_error("Unsupported race roster.");
 r->inLobby=online?2:1;void* selected=nullptr;
 for(int32_t i=0;i<count;i++){void* args[]={&i};auto player=invoke(klass(list),list,"get_Item",1,args);if(!unityAlive(player))continue;auto kind=read<int32_t>(player,"ePlayerType");if(kind<0 || kind>2)continue;auto global=read<int32_t>(player,"eAntPlayerNr");if(global<0 || global>=32)continue;auto preset=globalPreset(global);if(!preset)continue;auto& entry=r->lobby[r->lobbyCount++];entry.player=global;entry.presetId=read<int32_t>(preset,"iPresetID");entry.data=snapshot(preset);bool ai=kind==2 || read<bool>(player,"bIsNetworkPlayerAI");entry.flags=(kind==0?1:0)|(ai?2:0)|(online?4:0)|16;
 if(kind==0){auto local=read<int32_t>(player,"eAntLocalPlayerNr");if(local>=0 && local<6)entry.flags|=(local+1)<<8;}
 text(invoke(klass(player),player,"GetPlayerName"),entry.name,96);auto instance=unbox<int32_t>(invoke(klass(player),player,"GetInstanceID"));swprintf_s(entry.identity,L"race:%d:%d",global,instance);
 if(r->operation==3 && global==static_cast<int32_t>(r->player)){if(kind==0)throw std::runtime_error("Save your local setup from Quick Setup instead.");if(wcscmp(entry.identity,r->targetIdentity) || entry.presetId!=r->presetId || !same(entry.data,r->baseline))throw std::runtime_error("This racer or appearance changed. Refresh players before saving.");selected=preset;}
 }
 lobbyExtras(r,true,online && roomOwner(network));
 if(r->operation==3){if(!selected)throw std::runtime_error("The selected racer is no longer present.");saveLobbyPreset(r,profile,selected,false);}else if(r->operation!=2)throw std::runtime_error("CPU appearances can be changed after returning to the lobby.");return true;
}
static void lobby(Request *r, void *profile) {
  entryMetadata.clear();
  auto network = staticRead<void *>(type("PixelSDK"), "pixelMultiplayer");
  bool online = network && unbox<bool>(invoke(klass(network), network, "IsInRoom"));
  if(raceLobby(r,profile,network,online))return;
  lobbyExtras(r,false,online && roomOwner(network));
  auto menu = staticRead<void *>(type("MenuManager"), "Instance");
  if (!unityAlive(menu) || !unbox<bool>(invoke(klass(menu), menu, "get_isActiveAndEnabled"))) {
    if (r->operation != 2)
      throw std::runtime_error("The race lobby closed. Return to a lobby before copying.");
    return;
  }
  r->screen = staticRead<int32_t>(type("MenuManager"), "_eCurrentMenuScreenType");
  if (!online && !unbox<bool>(invoke(klass(menu), menu, "IsCurrentScreenLobbyCompatible"))) {
    if (r->operation != 2)
      throw std::runtime_error("The race lobby closed. Return to a lobby before copying.");
    return;
  }
  void *players = nullptr;
  void *selected = nullptr;
  void *source = nullptr;
  void *caller = nullptr;
  void *roomManager = nullptr;
  std::vector<std::pair<LobbyEntry*,void*>> editableCandidates;
  auto objectType=api<void *(*)(void *,const char *,const char *)>("il2cpp_class_from_name")(unityImage,"UnityEngine","Object");
  auto roomType=api<void *(*)(void *)>("il2cpp_type_get_object")(api<void *(*)(void *)>("il2cpp_class_get_type")(type("PTK_RoomPlayersManager")));
  roomManager=findUnityObject(objectType,roomType);
  if (online) {
    auto multi = read<void *>(menu, "theKartersMenuMultiManager");
    players = read<void *>(read<void *>(multi, "onlineRoomPlayersMenuManager"), "roomPlayers");
  } else
    players = read<void *>(read<void *>(menu, "singlePlayerMenuRoomManager"), "playerItems");
  if (!players) {
    if (r->operation != 2)
      throw std::runtime_error("The lobby players are no longer available.");
    return;
  }
  r->inLobby = online ? 2 : 1;
  void *sources[2] = {players, nullptr};
  void *roomUI = nullptr;
  if (online) {
    auto object = api<void *(*)(void *, const char *, const char *)>("il2cpp_class_from_name")(
        unityImage, "UnityEngine", "Object");
    auto target = api<void *(*)(void *)>("il2cpp_type_get_object")(
        api<void *(*)(void *)>("il2cpp_class_get_type")(type("PTK_RoomPlayersManager")));
    auto room = findUnityObject(object, target);
    if (room) {
      sources[1] = read<void *>(room, "aiPlayerItems");
      roomUI = read<void *>(room, "roomPlayers");
    }
  }
  for (int sourceIndex = 0; sourceIndex < 2; sourceIndex++) {
    if (!sources[sourceIndex])
      continue;
    auto length = api<uintptr_t (*)(void *)>("il2cpp_array_length")(sources[sourceIndex]);
    if (length > 32)
      throw std::runtime_error("Unsupported lobby size");
    for (uint32_t i = 0; i < length; i++) {
      auto player = at(sources[sourceIndex], i);
      if (!player || (online && sourceIndex == 0 ? !read<bool>(player, "bIsSlotTaken")
                                                 : read<bool>(player, "bIsEmptySlot")))
        continue;
      auto global = unbox<int32_t>(invoke(klass(player), player, "get_PlayerNumber"));
      if (global < 0 || global >= 32)
        continue;
      void *visibleSlot = nullptr;
      if (online && sourceIndex == 1) {
        bool duplicate = false;
        for (uint32_t j = 0; j < r->lobbyCount; j++)
          if (r->lobby[j].player == global)
            duplicate = true;
        if (duplicate || !roomUI)
          continue;
        auto slots = api<uintptr_t (*)(void *)>("il2cpp_array_length")(roomUI);
        for (uint32_t j = 0; j < slots; j++) {
          auto candidate = at(roomUI, j);
          if (candidate && read<int32_t>(candidate, "eAntGlobalPlayerNr") == global &&
              read<bool>(candidate, "bIsSlotTaken")) {
            visibleSlot = candidate;
            break;
          }
        }
        if (!visibleSlot)
          continue;
      }
      auto preset = globalPreset(global);
      if (!preset)
        continue;
      if (r->lobbyCount >= 32)
        throw std::runtime_error("Unsupported lobby size");
      auto &e = r->lobby[r->lobbyCount++];
      e.player = global;
      e.presetId = read<int32_t>(preset, "iPresetID");
      e.data = snapshot(preset);
      auto local = unbox<bool>(invoke(klass(player), player, "IsLocalPlayer"));
      auto ai = unbox<bool>(invoke(klass(player), player, "IsAI"));
      if(local && !ai && !caller)caller=player;
      e.flags = (local ? 1 : 0) | (ai ? 2 : 0) | (online ? 4 : 0) | (ai && (!online || roomOwner(network)) ? 32 : 0);
      if(e.flags&32)editableCandidates.push_back({&e,player});
      if(local && !ai){auto index=unbox<int32_t>(invoke(klass(player),player,"get_LocalPlayerIndex"));if(index>=0 && index<6)e.flags|=(index+1)<<8;}
      text(invoke(klass(player), player, "get_PlayerName"), e.name, 96);
      if (visibleSlot) {
        auto label = read<void *>(visibleSlot, "playerName");
        if (label)
          text(invoke(klass(label), label, "get_text"), e.name, 96);
      }
      text(invoke(klass(player), player, "GetID"), e.identity, 128);
      // Offline ILobbyPlayer.GetID is legitimately empty. Bind requests to the
      // actual managed player object and slot instead of sharing an empty ID.
      if(!e.identity[0]){auto hash=unbox<int32_t>(invoke(klass(player),player,"GetHashCode"));swprintf_s(e.identity,L"lobby:%d:%d",global,hash);}
      if(online && sourceIndex==0)cacheMetadata(player,e);
      if ((r->operation == 3 || r->operation == 8) && global == static_cast<int32_t>(r->player)) {
        if (wcscmp(e.identity, r->targetIdentity) || e.presetId != r->presetId ||
            !same(e.data, r->baseline))
          throw std::runtime_error(
              "This player or their setup changed. Refresh the lobby before copying.");
        if (local && r->operation==3)
          throw std::runtime_error("This is your local setup. Save it from Quick Setup instead.");
        selected = player;
        source = preset;
      }
    }
  }
  if(!editableCandidates.empty()){
    void* action=nullptr;if(caller && roomManager){action=api<void*(*)(void*)>("il2cpp_object_new")(type("SetPresetLobbyAction"));void* args[]={roomManager};invoke(klass(action),action,".ctor",1,args);}
    for(auto candidate:editableCandidates){bool allowed=false;if(action){void* args[]={caller,candidate.second};allowed=unbox<int32_t>(invoke(klass(action),action,"CanExecute",2,args))==2;}if(!allowed)candidate.first->flags&=~32;}
  }
  lobbyExtras(r,false,online && roomOwner(network));
  if(r->operation==8){
    if(!selected || !source)throw std::runtime_error("The selected CPU left this lobby. Refresh players before applying.");
    if(!unbox<bool>(invoke(klass(selected),selected,"IsAI")))throw std::runtime_error("Only CPU appearances can be changed through this operation.");
    if(online && !roomOwner(network))throw std::runtime_error("Only the lobby host can change CPU appearances.");
    if(!caller || !roomManager)throw std::runtime_error("The lobby controller is not ready. Reopen the Players screen and try again.");
    validate(r->desired);
    auto action=api<void*(*)(void*)>("il2cpp_object_new")(type("SetPresetLobbyAction"));void* ctorArgs[]={roomManager};invoke(klass(action),action,".ctor",1,ctorArgs);
    void* check[]={caller,selected};if(unbox<int32_t>(invoke(klass(action),action,"CanExecute",2,check))!=2)throw std::runtime_error("The game does not allow changing this CPU in the current screen.");
    auto next=api<void*(*)(void*)>("il2cpp_object_new")(klass(source));int32_t temporaryId=-1;void* presetCtor[]={&temporaryId};invoke(klass(next),next,".ctor",1,presetCtor);void* copy[]={source};invoke(klass(next),next,"CopyFrom",1,copy);write<int32_t>(next,"iPresetID",r->presetId);apply(next,r->desired);
    void* applyArgs[]={caller,selected,next};if(!unbox<bool>(invoke(klass(action),action,"ImmediateExecute",3,applyArgs)))throw std::runtime_error("The game declined this CPU appearance change.");
    r->current=snapshot(globalPreset(static_cast<int32_t>(r->player)));if(!same(r->current,r->desired))throw std::runtime_error("The CPU setup changed during application. Refresh players to review its actual setup.");r->saved=1;r->menuRefreshed=1;return;
  }
  if (r->operation != 3)
    return;
  if (!selected || !source)
    throw std::runtime_error("The selected player left the lobby. Refresh before copying.");
  saveLobbyPreset(r,profile,source,true);
}
static void saveLobbyPreset(Request* r,void* profile,void* source,bool menuReady){
  validate(r->baseline);
  auto collection = read<void *>(profile, "customizationPresets");
  auto list = invoke(klass(collection), collection, "GetPresetsList");
  auto count = unbox<int32_t>(invoke(klass(list), list, "get_Count"));
  if (count >= 10000)
    throw std::runtime_error("The preset library is full.");
  // A lost prior response must not create another identical copy on retry.
  for (int32_t i = 0; i < count; i++) {
    void *itemArgs[] = {&i};
    auto existing = invoke(klass(list), list, "get_Item", 1, itemArgs);
    if (same(snapshot(existing), r->baseline)) {
      r->current = r->baseline;
      r->presetId = read<int32_t>(existing, "iPresetID");
      return;
    }
  }
  auto renderer = staticRead<void *>(type("PTK_MenuIconRenderManager"), "Instance");
  if (menuReady && renderer) {
    void *args[] = {source};
    if (!unbox<bool>(invoke(klass(collection), collection, "AddNewPresetFrom", 1, args)))
      throw std::runtime_error("The game did not copy this preset.");
  } else {
    // AddNewPresetFrom unconditionally dereferences the menu renderer. During a
    // race use its same game-owned allocation/copy/list/save calls, deferring PNGs.
    auto id=unbox<int32_t>(invoke(klass(collection),collection,"GenerateUniqueID"));
    auto created=api<void*(*)(void*)>("il2cpp_object_new")(klass(source));int32_t initial=-1;void* ctor[]={&initial};invoke(klass(created),created,".ctor",1,ctor);void* copy[]={source};invoke(klass(created),created,"CopyFrom",1,copy);write<int32_t>(created,"iPresetID",id);void* add[]={created};invoke(klass(list),list,"Add",1,add);
    try{invoke(klass(profile),profile,"SaveProfileLocalData");}catch(...){void* remove[]={created};invoke(klass(list),list,"Remove",1,remove);throw;}
    wcscpy_s(r->warning,L"Saved. The game will generate its preview when the menu is available.");
  }
  r->saved = 1;
  auto after = unbox<int32_t>(invoke(klass(list), list, "get_Count"));
  if (after != count + 1)
    throw std::runtime_error(
        "The game library changed while copying. Refresh before trying again.");
  void *itemArgs[] = {&count};
  auto created = invoke(klass(list), list, "get_Item", 1, itemArgs);
  r->current = snapshot(created);
  r->presetId = read<int32_t>(created, "iPresetID");
  if (!same(r->current, r->baseline))
    throw std::runtime_error(
        "The game changed the copied cosmetics. Review the new preset before using it.");
}

static void* jsonType(const char* name,const char* ns="Newtonsoft.Json.Linq"){
 if(!jsonImage)throw std::runtime_error("The game's JSON runtime is unavailable.");auto result=api<void*(*)(void*,const char*,const char*)>("il2cpp_class_from_name")(jsonImage,ns,name);if(!result)throw std::runtime_error("Unsupported game JSON type.");return result;
}
static void* string(const char* chars,int length=-1){return length<0?api<void*(*)(const char*)>("il2cpp_string_new")(chars):api<void*(*)(const char*,uint32_t)>("il2cpp_string_new_len")(chars,length);}
static std::string utf8(void* str){auto len=api<int(*)(void*)>("il2cpp_string_length")(str);auto chars=api<const wchar_t*(*)(void*)>("il2cpp_string_chars")(str);int size=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,chars,len,nullptr,0,nullptr,nullptr);if(size<0)throw std::runtime_error("Invalid game JSON text.");std::string out(size,'\0');if(size)WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,chars,len,&out[0],size,nullptr,nullptr);return out;}
static void* parse(void* text){auto runtime=api<void*(*)(void*)>("il2cpp_type_get_object")(api<void*(*)(void*)>("il2cpp_class_get_type")(jsonType("JToken")));void* args[]={text,runtime,nullptr};return invoke(jsonType("JsonConvert","Newtonsoft.Json"),nullptr,"DeserializeObject",3,args);}
static void* member(void* token,const char* name){void* args[]={string(name)};auto value=invoke(klass(token),token,"get_Item",1,args);if(!value)throw std::runtime_error("Incomplete library transaction.");return value;}
static bool equalJson(void* left,void* right){void* args[]={left,right};return unbox<bool>(invoke(jsonType("JToken"),nullptr,"DeepEquals",2,args));}
static void* tokenText(void* token){return invoke(klass(token),token,"ToString");}
static void* exactMethod(void* c,const char* name,const std::vector<std::string>& parameters){
 void* iterator=nullptr;while(auto candidate=api<void*(*)(void*,void**)>("il2cpp_class_get_methods")(c,&iterator)){
  if(strcmp(api<const char*(*)(void*)>("il2cpp_method_get_name")(candidate),name) || api<uint32_t(*)(void*)>("il2cpp_method_get_param_count")(candidate)!=parameters.size())continue;
  bool match=true;for(uint32_t i=0;i<parameters.size();i++){auto param=api<void*(*)(void*,uint32_t)>("il2cpp_method_get_param")(candidate,i);auto n=api<char*(*)(void*)>("il2cpp_type_get_name")(param);match=match && n && parameters[i]==n;if(n)api<void(*)(void*)>("il2cpp_free")(n);}
  if(match)return candidate;
 }throw std::runtime_error("A required game JSON overload is unavailable.");
}
static void* deserialize(void* text,void* runtimeType){auto method=exactMethod(jsonType("JsonConvert","Newtonsoft.Json"),"DeserializeObject",{"System.String","System.Type","Newtonsoft.Json.JsonSerializerSettings"});void* args[]={text,runtimeType,nullptr};void* ex=nullptr;auto value=api<void*(*)(void*,void*,void**,void**)>("il2cpp_runtime_invoke")(method,nullptr,args,&ex);if(ex || !value)throw std::runtime_error("The game rejected the library data. Nothing was saved.");return value;}
static void* runtimeType(void* type){return api<void*(*)(void*)>("il2cpp_type_get_object")(type);}
static void response(Request* r,const std::string& value){if(value.size()>r->responseCapacity)throw std::runtime_error("The live library exceeds this response limit.");memcpy(reinterpret_cast<char*>(r)+sizeof(Request)+r->payloadBytes,value.data(),value.size());r->responseBytes=static_cast<uint32_t>(value.size());}
static void retainSubscription(Request* r){
 if(!r->payloadBytes)throw std::runtime_error("Missing Workshop subscription identity.");auto input=parse(string(reinterpret_cast<char*>(r)+sizeof(Request),r->payloadBytes));auto idText=utf8(tokenText(member(input,"workshopId")));if(idText.empty() || idText.size()>19 || idText.find_first_not_of("0123456789")!=std::string::npos)throw std::runtime_error("Invalid Workshop subscription identity.");int64_t id=std::stoll(idText);if(id<=0)throw std::runtime_error("Invalid Workshop subscription identity.");auto queues=autoQueues();
 // Validate every active/orphaned queue before changing ownership. An asynchronous
 // processing continuation could otherwise add it back and unsubscribe it later.
 for(auto queue:queues){void* args[]={&id};if(invoke(klass(queue),queue,"FindByModId",1,args) || unbox<bool>(invoke(klass(queue),queue,"ContainsProcessingMod",1,args)))throw std::runtime_error("This item is still being downloaded or processed by the game. Wait for it to finish, then keep it permanently.");}
 auto checkCurrent=[&](void* item){if(item && read<int64_t>(item,"modId")==id)throw std::runtime_error("The game is still processing this automatic download. Try again after it finishes.");};auto manager=staticRead<void*>(type("PTK_LobbyAutoDownloadManager"),"<Instance>k__BackingField");if(manager)checkCurrent(read<void*>(manager,"_currentDownload"));auto orphanField=api<void*(*)(void*,const char*)>("il2cpp_class_get_field_from_name")(type("PTK_LobbyAutoDownloadManager"),"_orphanedDownloads");if(orphanField){void* list=nullptr;api<void(*)(void*,void*)>("il2cpp_field_static_get_value")(orphanField,&list);if(list){auto count=unbox<int32_t>(invoke(klass(list),list,"get_Count"));for(int32_t i=0;i<count;i++){void* args[]={&i};auto item=invoke(klass(list),list,"get_Item",1,args);if(item)checkCurrent(read<void*>(item,"currentDownload"));}}}
 int removed=0;for(auto queue:queues){auto list=read<void*>(queue,"_downloadedItems");for(int32_t i=unbox<int32_t>(invoke(klass(list),list,"get_Count"))-1;i>=0;i--){void* args[]={&i};auto item=invoke(klass(list),list,"get_Item",1,args);if(item && read<int64_t>(item,"modId")==id){invoke(klass(list),list,"RemoveAt",1,args);removed++;}}auto completed=read<void*>(queue,"_completedModIds");void* args[]={&id};invoke(klass(completed),completed,"Remove",1,args);}
 if(temporarilyOwned(id))throw std::runtime_error("The game still owns this automatic subscription. Refresh before trying again.");response(r,"{\"retained\":true,\"releasedAutomaticRecords\":"+std::to_string(removed)+"}");
}
static std::unordered_map<int,void*> presetMap(void* list){std::unordered_map<int,void*> values;auto count=unbox<int32_t>(invoke(klass(list),list,"get_Count"));if(count<0 || count>10000)throw std::runtime_error("Unsupported preset library size.");for(int32_t i=0;i<count;i++){void* args[]={&i};auto preset=invoke(klass(list),list,"get_Item",1,args);snapshot(preset);if(!values.emplace(read<int32_t>(preset,"iPresetID"),preset).second)throw std::runtime_error("Duplicate preset identities.");}return values;}
static void library(Request* r,void* profile){
 auto collection=read<void*>(profile,"customizationPresets");auto local=read<void*>(profile,"localNotSafeData");auto data=read<void*>(local,"profileData");auto oldList=read<void*>(collection,"profileCustomizationPresets");auto oldGroups=read<void*>(data,"ItemsGroupDefinedContainers");
 auto livePresets=parse(invoke(klass(collection),collection,"GetJSON_Data"));auto liveProfile=parse(invoke(klass(local),local,"GetJSON_Data"));auto liveGroups=member(liveProfile,"ItemsGroupDefinedContainers");
 if(r->operation==6){response(r,"{\"presets\":"+utf8(tokenText(livePresets))+",\"groups\":"+utf8(tokenText(liveGroups))+"}");return;}
 if(!r->payloadBytes)throw std::runtime_error("Missing library transaction.");auto root=parse(string(reinterpret_cast<char*>(r)+sizeof(Request),r->payloadBytes));auto before=member(root,"baseline");auto desired=member(root,"desired");
 if(!equalJson(livePresets,member(before,"presets")) || !equalJson(liveGroups,member(before,"groups")))throw std::runtime_error("The game library changed. Refresh Garage before saving; your changes were not written.");
 auto wantedPresets=member(desired,"presets");auto wantedGroups=member(desired,"groups");if(equalJson(livePresets,wantedPresets) && equalJson(liveGroups,wantedGroups)){r->saved=1;return;}
 auto listType=runtimeType(api<void*(*)(void*)>("il2cpp_class_get_type")(klass(oldList)));auto newList=deserialize(tokenText(wantedPresets),listType);
 auto wrapper=std::string("{\"ItemsGroupDefinedContainers\":")+utf8(tokenText(wantedGroups))+"}";auto profileType=runtimeType(api<void*(*)(void*)>("il2cpp_class_get_type")(klass(data)));auto partial=deserialize(string(wrapper.data(),static_cast<int>(wrapper.size())),profileType);auto newGroups=read<void*>(partial,"ItemsGroupDefinedContainers");if(!newGroups)throw std::runtime_error("Missing native groups.");
 auto oldPresets=presetMap(oldList);auto newPresets=presetMap(newList);std::vector<void*> changed;
 // Keep unchanged live objects, including cached icon references and race users.
 auto total=unbox<int32_t>(invoke(klass(newList),newList,"get_Count"));for(int32_t i=0;i<total;i++){void* get[]={&i};auto next=invoke(klass(newList),newList,"get_Item",1,get);auto id=read<int32_t>(next,"iPresetID");auto old=oldPresets.find(id);if(old!=oldPresets.end() && same(snapshot(old->second),snapshot(next))){void* set[]={&i,old->second};invoke(klass(newList),newList,"set_Item",2,set);newPresets[id]=old->second;}else changed.push_back(next);}
 for(auto old:oldPresets)if(newPresets.find(old.first)==newPresets.end()){
   // Game DeletePreset leaves historical IDs intact; only live active references conflict.
   auto sync=staticRead<void*>(type("Ant_CurrentGameConfiguration"),"playersCustomization");for(int32_t player=0;player<6;player++){void* args[]={&player};auto active=invoke(klass(sync),sync,"GetPlayerData___LOCAL_PC_PLAYER",1,args);if(active && read<int32_t>(active,"iPresetID")==old.first)throw std::runtime_error("This preset is active for a local player. Choose another setup before deleting it.");}
 }
 auto menu=staticRead<void*>(type("MenuManager"),"Instance");bool inMenu=unityAlive(menu) && unbox<bool>(invoke(klass(menu),menu,"get_isActiveAndEnabled"));void* manager=nullptr;void* editing=nullptr;
 if(inMenu){r->screen=staticRead<int32_t>(type("MenuManager"),"_eCurrentMenuScreenType");manager=read<void*>(menu,"mainMenuPresetsManager");if(manager && r->screen==115 && !unbox<bool>(invoke(klass(manager),manager,"IsQuickPresetBeingEdited"))){editing=read<void*>(manager,"currentlySelectedPresetItem");if(editing){auto id=read<int32_t>(editing,"iPresetID");auto old=oldPresets.find(id),next=newPresets.find(id);if(old!=oldPresets.end() && (next==newPresets.end() || !same(snapshot(old->second),snapshot(next->second)))){if(next==newPresets.end())throw std::runtime_error("Finish editing this preset in the game before deleting it.");for(auto fieldName:{"customizationScreenEnterSavedPreset","customizationElementsClickedApprovedPreset","presetForCurrentItemsSelecting"})if(!same(snapshot(read<void*>(manager,fieldName)),snapshot(old->second)))throw std::runtime_error("This preset has unsaved game edits. Confirm or discard them before saving from Garage.");}}}}
 // A live in-game group editor keeps its own working references. Reject only a
 // conflicting groups transaction, not unrelated preset edits or a running race.
 if(!equalJson(liveGroups,wantedGroups) && staticRead<void*>(type("GroupsManager"),"<currentlyModifiedGroup>k__BackingField"))throw std::runtime_error("Finish the open group edit in the game before changing groups in Garage.");
 void* validateArgs[]={string("validateOnly")};auto validateFlag=invoke(klass(root),root,"get_Item",1,validateArgs);if(validateFlag && (utf8(tokenText(validateFlag))=="True" || utf8(tokenText(validateFlag))=="true")){wcscpy_s(r->warning,L"Library changes validated. Nothing was written.");return;}
 write<void*>(collection,"profileCustomizationPresets",newList);write<void*>(data,"ItemsGroupDefinedContainers",newGroups);
 try{
  if(!equalJson(parse(invoke(klass(collection),collection,"GetJSON_Data")),wantedPresets) || !equalJson(member(parse(invoke(klass(local),local,"GetJSON_Data")),"ItemsGroupDefinedContainers"),wantedGroups))throw std::runtime_error("The game could not preserve all library fields. Nothing was saved.");
  invoke(klass(profile),profile,"SaveProfileLocalData");r->saved=1;
 }catch(...){write<void*>(collection,"profileCustomizationPresets",oldList);write<void*>(data,"ItemsGroupDefinedContainers",oldGroups);try{invoke(klass(profile),profile,"SaveProfileLocalData");}catch(...){}throw;}
 if(inMenu){try{auto icons=staticRead<void*>(type("PTK_MenuIconRenderManager"),"Instance");if(icons)for(auto preset:changed){void* args[]={preset};invoke(klass(icons),icons,"EnsurePresetIcon",1,args);}if(editing){auto it=newPresets.find(read<int32_t>(editing,"iPresetID"));if(it!=newPresets.end() && it->second!=editing){write<void*>(manager,"currentlySelectedPresetItem",it->second);for(auto fieldName:{"customizationScreenEnterSavedPreset","customizationElementsClickedApprovedPreset","presetForCurrentItemsSelecting"}){auto working=read<void*>(manager,fieldName);if(working){void* args[]={it->second};invoke(klass(working),working,"CopyFrom",1,args);}}r->menuRefreshed=1;}}}catch(...){wcscpy_s(r->warning,L"Saved. Reopen the game collection to refresh its previews.");}}
 else wcscpy_s(r->warning,L"Saved for the next selection. The current race setup is unchanged.");
}
static void run(Request *r) {
  try {
    if (r->magic != 0x42475153 || r->version != 3 || r->player >= 32 || r->operation > 8 ||
        r->payloadBytes > 48*1024*1024 || r->responseCapacity > 48*1024*1024 ||
        (r->operation < 2 && r->player >= 6) || r->targetIdentity[127] || r->profile[127] ||
        r->baseline.modded > 1 || r->desired.modded > 1)
      throw std::runtime_error("Invalid Quick Setup request");
    MEMORY_BASIC_INFORMATION region{};if(!VirtualQuery(r,&region,sizeof(region)) || region.RegionSize<sizeof(Request)+static_cast<size_t>(r->payloadBytes)+r->responseCapacity)throw std::runtime_error("Incomplete native transport mapping.");
    r->thread = GetCurrentThreadId();
    game = GetModuleHandleW(L"GameAssembly.dll");
    if (!game)
      throw std::runtime_error("The game runtime is unavailable");
    if (!api<void *(*)()>("il2cpp_thread_current")())
      throw std::runtime_error("Not on the game runtime thread");
    auto d = api<void *(*)()>("il2cpp_domain_get")();
    size_t count = 0;
    auto assemblies = api<void **(*)(void *, size_t *)>("il2cpp_domain_get_assemblies")(d, &count);
    void *unity = nullptr;
    for (size_t i = 0; i < count; i++) {
      auto im = api<void *(*)(void *)>("il2cpp_assembly_get_image")(assemblies[i]);
      auto n = api<const char *(*)(void *)>("il2cpp_image_get_name")(im);
      if (!strcmp(n, "Assembly-CSharp.dll"))
        image = im;
      if (!strcmp(n, "UnityEngine.CoreModule.dll"))
        unity = im;
      if (!strcmp(n, "Newtonsoft.Json.dll"))jsonImage=im;
    }
    if (!image || !unity)
      throw std::runtime_error("Game assemblies unavailable");
    unityImage = unity;
    auto go = api<void *(*)(void *, const char *, const char *)>("il2cpp_class_from_name")(
        unity, "UnityEngine", "GameObject");
    void *query =
        api<void *(*)(const char *)>("il2cpp_string_new")("__BobbysGarage_MainThreadCheck__");
    void *args[] = {query};
    invoke(go, nullptr, "Find", 1, args);
    auto profile = staticRead<void *>(type("PTK_PlayerProfile"), "Instance");
    if (!read<bool>(profile, "bIsProfileDataLoaded"))
      throw std::runtime_error("Game profile not loaded");
    auto name = invoke(klass(profile), profile, "get_strLocalSaveFileName");
    auto len = api<int (*)(void *)>("il2cpp_string_length")(name);
    auto chars = api<const wchar_t *(*)(void *)>("il2cpp_string_chars")(name);
    if (len < 1 || len >= 128 || static_cast<size_t>(len) != wcslen(r->profile) ||
        wmemcmp(chars, r->profile, len))
      throw std::runtime_error(
          "The running game uses another profile. Refresh Steam and reopen Quick Setup.");
    if (r->operation==7){retainSubscription(r);return;}
    if (r->operation==5 || r->operation==6){library(r,profile);return;}
    if (r->operation == 4) {
      auto collection = read<void *>(profile, "customizationPresets");
      int32_t id = r->presetId;
      void *args[] = {&id};
      auto created = invoke(klass(collection), collection, "GetPresetFromPresetID", 1, args);
      if (!created || !same(snapshot(created), r->baseline))
        throw std::runtime_error("The copied preset changed. Automatic cleanup was not applied.");
      invoke(klass(collection), collection, "DeletePreset", 1, args);
      r->saved = 1;
      return;
    }
    if (r->operation >= 2) {
      lobby(r, profile);
      return;
    }
    auto data = read<void *>(read<void *>(profile, "localNotSafeData"), "profileData");
    auto slot = at(read<void *>(data, "QuickCreationPresets"), r->player);
    if (!read<bool>(slot, "BQuickPresetInitialized"))
      throw std::runtime_error("Quick Setup is uninitialized");
    auto preset = read<void *>(slot, "QuickPreset");
    if (read<int32_t>(preset, "iPresetID") != r->presetId)
      throw std::runtime_error("The Quick Setup identity changed");
    r->current = snapshot(preset);
    auto menuType = type("MenuManager");
    auto menu = staticRead<void *>(menuType, "Instance");
    bool inMenu = false;
    void *manager = nullptr;
    bool editing = false;
    try {
      inMenu = unityAlive(menu) && unbox<bool>(invoke(klass(menu), menu, "get_isActiveAndEnabled"));
    } catch (...) {
      inMenu = false;
    }
    if (inMenu) {
      r->screen = staticRead<int32_t>(menuType, "_eCurrentMenuScreenType");
      manager = read<void *>(menu, "mainMenuPresetsManager");
      if (manager && (r->screen == 106 || r->screen == 115) &&
          unbox<int32_t>(invoke(klass(menu), menu, "GetPresetEditorTargetLocalPlayer")) ==
              static_cast<int32_t>(r->player))
        editing = unbox<bool>(invoke(klass(manager), manager, "IsQuickPresetBeingEdited"));
    }
    if (!r->operation)
      return;
    if (!same(r->current, r->baseline))
      throw std::runtime_error("Quick Setup changed in the game. Reopen it to review the latest "
                               "setup; your draft was not written.");
    validate(r->desired);
    if (editing) {
      for (auto n :
           {"customizationScreenEnterSavedPreset", "customizationElementsClickedApprovedPreset",
            "presetForCurrentItemsSelecting"})
        if (!same(snapshot(read<void *>(manager, n)), r->baseline))
          throw std::runtime_error(
              "Quick Setup has unsaved edits in the game. Confirm or cancel those edits first.");
    }
    // Validate everything before mutating only existing scalar cosmetic fields.
    apply(preset, r->desired);
    try {
      invoke(klass(profile), profile, "SaveProfileLocalData");
      r->saved = 1;
    } catch (...) {
      apply(preset, r->baseline);
      try {
        invoke(klass(profile), profile, "SaveProfileLocalData");
      } catch (...) {
      }
      throw;
    }
    if (inMenu) {
      try {
        auto sync =
            staticRead<void *>(type("Ant_CurrentGameConfiguration"), "playersCustomization");
        int32_t player = r->player;
        void *getArgs[] = {&player};
        auto active = invoke(klass(sync), sync, "GetPlayerData___LOCAL_PC_PLAYER", 1, getArgs);
        if (active && read<int32_t>(active, "iPresetID") == r->presetId) {
          bool force = false;
          void *setArgs[] = {&player, preset, &force};
          invoke(klass(sync), sync, "SetDataFor_LOCAL_Player", 3, setArgs);
        }
        if (editing) {
          invoke(klass(manager), manager, "LoadQuickPresetForEditing");
          r->menuRefreshed = 1;
        }
        auto icons = staticRead<void *>(type("PTK_MenuIconRenderManager"), "Instance");
        if (icons) {
          void *iconArgs[] = {preset};
          invoke(klass(icons), icons, "EnsurePresetIcon", 1, iconArgs);
        }
      } catch (...) {
        wcscpy_s(r->warning, L"Saved. Reopen Quick Setup in the game to refresh its preview.");
      }
    } else
      wcscpy_s(r->warning,
               L"Saved for the next Quick Setup selection. The current race is unchanged.");
    r->current = snapshot(preset);
  } catch (const std::exception &e) {
    MultiByteToWideChar(CP_UTF8, 0, e.what(), -1, r->error, 256);
  }
}
static void safeRun(Request *r) {
  __try {
    run(r);
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    wcscpy_s(
        r->error,
        L"The bridge rejected an incompatible game runtime. Refresh the setup before retrying.");
  }
}
extern "C" __declspec(dllexport) LRESULT CALLBACK GarageQuickSetup(int code, WPARAM w, LPARAM l) {
  if (code >= 0 && w == PM_REMOVE) {
    auto msg = reinterpret_cast<MSG *>(l);
    if (msg && msg->message == RegisterWindowMessageW(L"BobbysGarage.QuickSetup.v1")) {
      wchar_t name[128];
      swprintf_s(name, L"Local\\BobbysGarageQuick_%lu_%llx", GetCurrentProcessId(),
                 static_cast<unsigned long long>(msg->wParam));
      auto h = OpenFileMappingW(FILE_MAP_ALL_ACCESS, FALSE, name);
      if (h) {
        auto r =
            static_cast<Request *>(MapViewOfFile(h, FILE_MAP_ALL_ACCESS, 0, 0, 0));
        if (r) {
          if (InterlockedCompareExchange(&r->state, 1, 0) == 0) {
            safeRun(r);
            InterlockedExchange(&r->state, 2);
          }
          UnmapViewOfFile(r);
        }
        CloseHandle(h);
      }
    }
  }
  return CallNextHookEx(nullptr, code, w, l);
}

extern "C" __declspec(dllexport) LONG GarageCancel(Request *r) {
  return InterlockedCompareExchange(&r->state, -1, 0);
}
