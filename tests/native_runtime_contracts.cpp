// Synthetic IL2CPP metadata. Execute the production helpers against moved
// layouts, changed types and added overloads; never open the real game.
#include "../native-bridge/QuickSetup.cpp"
#include <array>
#include <cassert>
#include <iostream>

struct FakeClass;
struct FakeType { FakeClass* owner; int code; bool byref=false; };
struct FakeField { const char* name; FakeType* type; int flags=0; size_t offset=0; int32_t constant=0; };
struct FakeMethod { const char* name; std::vector<FakeType*> parameters; void* result; bool instance=true; bool generic=false; };
struct FakeClass {
  FakeType* type=nullptr; FakeClass* parent=nullptr; bool value=false; bool enumeration=false;
  FakeType* underlying=nullptr; std::vector<FakeField*> fields; std::vector<FakeMethod*> methods;
  FakeClass* element=nullptr; int elementSize=0; int rank=0;
};
struct FakeObject { FakeClass* type; std::array<uint8_t,128> data{}; };
static int writes=0, calls=0;
static uint32_t headerSize=48;
static std::unordered_map<void*,uintptr_t> arrayLengths;
#define EXPORT extern "C" __declspec(dllexport)
EXPORT void* il2cpp_object_get_class(FakeObject* o){return o->type;}
EXPORT void* il2cpp_class_from_type(FakeType* t){return t->owner;}
EXPORT void* il2cpp_class_get_type(FakeClass* c){return c->type;}
EXPORT bool il2cpp_class_is_valuetype(FakeClass* c){return c->value;}
EXPORT bool il2cpp_class_is_enum(FakeClass* c){return c->enumeration;}
EXPORT void* il2cpp_class_enum_basetype(FakeClass* c){return c->underlying;}
EXPORT bool il2cpp_type_is_byref(FakeType* t){return t->byref;}
EXPORT int il2cpp_type_get_type(FakeType* t){return t->code;}
EXPORT void* il2cpp_class_get_parent(FakeClass* c){return c->parent;}
EXPORT bool il2cpp_class_is_assignable_from(FakeClass* target,FakeClass* value){for(;value;value=value->parent)if(target==value)return true;return false;}
EXPORT void* il2cpp_class_get_field_from_name(FakeClass* c,const char* name){for(;c;c=c->parent)for(auto f:c->fields)if(!strcmp(f->name,name))return f;return nullptr;}
EXPORT void* il2cpp_field_get_type(FakeField* f){return f->type;}
EXPORT int il2cpp_field_get_flags(FakeField* f){return f->flags;}
static size_t width(FakeType* t){if(t->owner->enumeration)t=t->owner->underlying;return t->code==2?1:t->code==8?4:8;}
EXPORT void il2cpp_field_get_value(FakeObject* o,FakeField* f,void* output){memcpy(output,o->data.data()+f->offset,width(f->type));}
EXPORT void il2cpp_field_static_get_value(FakeField* f,void* output){memcpy(output,&f->constant,4);}
EXPORT void il2cpp_field_set_value(FakeObject* o,FakeField* f,void* value){writes++;memcpy(o->data.data()+f->offset,value,width(f->type));}
EXPORT void il2cpp_field_set_value_object(FakeObject* o,FakeField* f,void* value){writes++;memcpy(o->data.data()+f->offset,&value,sizeof(value));}
EXPORT void* il2cpp_object_unbox(FakeObject* o){return o->data.data();}
EXPORT void* il2cpp_class_get_element_class(FakeClass* c){return c->element;}
EXPORT int il2cpp_class_get_rank(FakeClass* c){return c->rank;}
EXPORT int32_t il2cpp_array_element_size(FakeClass* c){return c->elementSize;}
EXPORT uint32_t il2cpp_array_object_header_size(){return headerSize;}
EXPORT uintptr_t il2cpp_array_length(void* a){return arrayLengths.at(a);}
EXPORT void* il2cpp_class_get_methods(FakeClass* c,void** iterator){auto i=reinterpret_cast<uintptr_t>(*iterator);if(i>=c->methods.size())return nullptr;*iterator=reinterpret_cast<void*>(i+1);return c->methods[i];}
EXPORT const char* il2cpp_method_get_name(FakeMethod* m){return m->name;}
EXPORT uint32_t il2cpp_method_get_param_count(FakeMethod* m){return static_cast<uint32_t>(m->parameters.size());}
EXPORT bool il2cpp_method_is_generic(FakeMethod* m){return m->generic;}
EXPORT bool il2cpp_method_is_instance(FakeMethod* m){return m->instance;}
EXPORT void* il2cpp_method_get_param(FakeMethod* m,uint32_t i){return m->parameters.at(i);}
EXPORT void* il2cpp_runtime_invoke(FakeMethod* m,void*,void**,void** exception){calls++;*exception=nullptr;return m->result;}

template<typename F> static void rejects(F operation){bool failed=false;try{operation();}catch(const std::runtime_error&){failed=true;}assert(failed);}
int main(){
  game=GetModuleHandleW(nullptr);
  FakeClass integer{},boolean{},longInteger{},object{},textClass{},enumClass{};
  FakeType intType{&integer,8},boolType{&boolean,2},longType{&longInteger,10},refType{&object,18},textType{&textClass,14},enumType{&enumClass,17};
  integer.type=&intType;integer.value=true;boolean.type=&boolType;boolean.value=true;
  longInteger.type=&longType;longInteger.value=true;object.type=&refType;
  textClass.type=&textType;textClass.parent=&object;
  enumClass.type=&enumType;enumClass.value=true;enumClass.enumeration=true;enumClass.underlying=&intType;
  FakeField id{"id",&intType},reference{"reference",&refType,0,64},state{"state",&enumType,0,40},allowed{"E_CAN_BE_USED",&enumType,0x50,0,77};
  object.fields={&id,&reference,&state};enumClass.fields={&allowed};
  FakeObject instance{&object},stringObject{&textClass},box{&integer};
  write<int32_t>(&instance,"id",123);assert(read<int32_t>(&instance,"id")==123);
  id.offset=24;write<int32_t>(&instance,"id",456);assert(read<int32_t>(&instance,"id")==456);
  auto before=writes;id.type=&boolType;rejects([&]{write<int32_t>(&instance,"id",9);});assert(writes==before);id.type=&intType;
  write<void*>(&instance,"reference",&stringObject);assert(read<void*>(&instance,"reference")==&stringObject);
  rejects([&]{write<void*>(&instance,"reference",&box);});assert(writes==before+1);
  write<int32_t>(&instance,"state",77);assert(fieldEnum(&object,"state","E_CAN_BE_USED")==77);
  enumClass.underlying=&longType;rejects([&]{read<int32_t>(&instance,"state");});enumClass.underlying=&intType;
  int32_t value=333;memcpy(box.data.data(),&value,4);assert(unbox<int32_t>(&box)==333);rejects([&]{unbox<bool>(&box);});
  FakeMethod numeric{"Select",{&intType},&box},text{"Select",{&textType},&stringObject},broad{"Select",{&refType},&instance};
  object.methods={&broad,&text,&numeric};RuntimeArg numericArgs[]={&value},textArgs[]={static_cast<void*>(&stringObject)};
  assert(invoke(&object,&instance,"Select",1,numericArgs)==&box);
  assert(invoke(&object,&instance,"Select",1,textArgs)==&stringObject);
  auto priorCalls=calls;bool flag=false;RuntimeArg wrongArgs[]={&flag};rejects([&]{invoke(&object,&instance,"Select",1,wrongArgs);});assert(calls==priorCalls);
  FakeMethod duplicate=numeric;object.methods.push_back(&duplicate);rejects([&]{invoke(&object,&instance,"Select",1,numericArgs);});assert(calls==priorCalls);
  FakeClass array{};array.element=&object;array.elementSize=sizeof(void*);array.rank=1;
  std::array<uint8_t,160> bytes{};auto arrayObject=bytes.data();auto arrayClass=&array;memcpy(arrayObject,&arrayClass,sizeof(arrayClass));arrayLengths[arrayObject]=2;
  void* expected=&stringObject;
  for(auto movedHeader:{48u,96u}){headerSize=movedHeader;memcpy(arrayObject+headerSize+sizeof(void*),&expected,sizeof(expected));assert(at(arrayObject,1)==expected);}
  rejects([&]{at(arrayObject,2);});array.element=&integer;array.elementSize=4;rejects([&]{at(arrayObject,0);});
  std::cout<<"PASS: relocated fields/arrays, changed scalar/enum types, reference assignments, boxed returns, added/ambiguous overloads, and bounds\n";
}
