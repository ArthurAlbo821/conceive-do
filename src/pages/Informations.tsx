import { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, X, FileText } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useUserInformations, type UserInformations } from "@/hooks/useUserInformations";
import { AvailabilityManager } from "@/components/availability/AvailabilityManager";

const informationsSchema = z.object({
  prestations: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1, "La prestation ne peut pas être vide"),
      })
    )
    .max(10, "Maximum 10 prestations"),

  extras: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1, "Le nom de l'extra ne peut pas être vide"),
        price: z.coerce.number().min(0, "Le prix doit être positif"),
      })
    )
    .max(10, "Maximum 10 extras"),

  taboos: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1, "Le taboo ne peut pas être vide"),
      })
    )
    .max(10, "Maximum 10 taboos"),

  tarifs: z.array(
    z.object({
      id: z.string(),
      duration: z.string().min(1, "La durée ne peut pas être vide"),
      price: z.coerce.number().min(0, "Le prix doit être positif"),
    })
  ),

  adresse: z.string().optional(),
});

type FormValues = z.infer<typeof informationsSchema>;

const Informations = () => {
  const { informations, isLoading, saveInformations, isSaving } = useUserInformations();

  const form = useForm<FormValues>({
    resolver: zodResolver(informationsSchema),
    defaultValues: {
      prestations: [],
      extras: [],
      taboos: [],
      tarifs: [],
      adresse: "",
    },
  });

  const prestationsArray = useFieldArray({
    control: form.control,
    name: "prestations",
  });

  const extrasArray = useFieldArray({
    control: form.control,
    name: "extras",
  });

  const taboosArray = useFieldArray({
    control: form.control,
    name: "taboos",
  });

  const tarifsArray = useFieldArray({
    control: form.control,
    name: "tarifs",
  });

  useEffect(() => {
    if (informations) {
      form.reset(informations);
    }
  }, [informations, form]);

  const onSubmit = (data: FormValues) => {
    // Ensure all required fields are present
    const formattedData: UserInformations = {
      prestations: data.prestations.map((p) => ({ id: p.id, name: p.name })),
      extras: data.extras.map((e) => ({ id: e.id, name: e.name, price: e.price })),
      taboos: data.taboos.map((t) => ({ id: t.id, name: t.name })),
      tarifs: data.tarifs.map((t) => ({ id: t.id, duration: t.duration, price: t.price })),
      adresse: data.adresse || "",
    };
    saveInformations(formattedData);
  };

  if (isLoading) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <main className="flex-1 p-6">
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Chargement...</p>
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1">
          <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-6">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              <h1 className="text-xl font-semibold">Informations professionnelles</h1>
            </div>
          </header>

          <div className="p-6 max-w-4xl mx-auto">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Prestations */}
                <Card>
                  <CardHeader>
                    <CardTitle>Prestations</CardTitle>
                    <CardDescription>
                      Liste de vos prestations ({prestationsArray.fields.length}/10)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {prestationsArray.fields.map((field, index) => (
                      <FormField
                        key={field.id}
                        control={form.control}
                        name={`prestations.${index}.name`}
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex gap-2">
                              <FormControl>
                                <Input placeholder="Ex: Massage relaxant" {...field} />
                              </FormControl>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => prestationsArray.remove(index)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => prestationsArray.append({ id: crypto.randomUUID(), name: "" })}
                      disabled={prestationsArray.fields.length >= 10}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Ajouter une prestation
                    </Button>
                  </CardContent>
                </Card>

                {/* Extras */}
                <Card>
                  <CardHeader>
                    <CardTitle>Extras</CardTitle>
                    <CardDescription>
                      Services supplémentaires avec tarifs ({extrasArray.fields.length}/10)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {extrasArray.fields.map((field, index) => (
                      <div key={field.id} className="space-y-2">
                        <div className="flex gap-2">
                          <FormField
                            control={form.control}
                            name={`extras.${index}.name`}
                            render={({ field }) => (
                              <FormItem className="flex-1">
                                <FormControl>
                                  <Input placeholder="Nom de l'extra" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`extras.${index}.price`}
                            render={({ field }) => (
                              <FormItem className="w-32">
                                <FormControl>
                                  <Input type="number" placeholder="Prix" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => extrasArray.remove(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        extrasArray.append({ id: crypto.randomUUID(), name: "", price: 0 })
                      }
                      disabled={extrasArray.fields.length >= 10}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Ajouter un extra
                    </Button>
                  </CardContent>
                </Card>

                {/* Taboos */}
                <Card>
                  <CardHeader>
                    <CardTitle>Taboos</CardTitle>
                    <CardDescription>
                      Pratiques non acceptées ({taboosArray.fields.length}/10)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {taboosArray.fields.map((field, index) => (
                      <FormField
                        key={field.id}
                        control={form.control}
                        name={`taboos.${index}.name`}
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex gap-2">
                              <FormControl>
                                <Input placeholder="Ex: Pratique non acceptée" {...field} />
                              </FormControl>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => taboosArray.remove(index)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => taboosArray.append({ id: crypto.randomUUID(), name: "" })}
                      disabled={taboosArray.fields.length >= 10}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Ajouter un taboo
                    </Button>
                  </CardContent>
                </Card>

                {/* Tarifs */}
                <Card>
                  <CardHeader>
                    <CardTitle>Tarifs</CardTitle>
                    <CardDescription>
                      Grille tarifaire selon la durée ({tarifsArray.fields.length})
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {tarifsArray.fields.map((field, index) => (
                      <div key={field.id} className="space-y-2">
                        <div className="flex gap-2">
                          <FormField
                            control={form.control}
                            name={`tarifs.${index}.duration`}
                            render={({ field }) => (
                              <FormItem className="flex-1">
                                <FormControl>
                                  <Input placeholder="Ex: 30 min, 1h, nuit..." {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`tarifs.${index}.price`}
                            render={({ field }) => (
                              <FormItem className="w-32">
                                <FormControl>
                                  <Input type="number" placeholder="Prix" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => tarifsArray.remove(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        tarifsArray.append({ id: crypto.randomUUID(), duration: "", price: 0 })
                      }
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Ajouter un tarif
                    </Button>
                  </CardContent>
                </Card>

                {/* Adresse */}
                <Card>
                  <CardHeader>
                    <CardTitle>Adresse</CardTitle>
                    <CardDescription>Votre adresse professionnelle</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FormField
                      control={form.control}
                      name="adresse"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea
                              placeholder="Entrez votre adresse complète"
                              className="min-h-[100px]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <div className="flex justify-end">
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? "Enregistrement..." : "Enregistrer"}
                  </Button>
                </div>
              </form>
            </Form>

            {/* Disponibilités */}
            <div className="mt-6">
              <AvailabilityManager />
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Informations;
